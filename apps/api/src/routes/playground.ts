import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

export const playgroundRouter = new OpenAPIHono();
playgroundRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

function getLlm() {
  const provider = process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY ? 'openai' : 'gemini';
  if (provider === 'openai') {
    return new ChatOpenAI({
      model: process.env.OPENAI_MODEL || 'gpt-6-luna',
      apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
      configuration: { baseURL: process.env.OPENAI_BASE_URL || 'https://oryxa.openai.azure.com/openai/v1' },
    });
  }
  return new ChatGoogleGenerativeAI({
    model: 'gemini-flash-lite-latest',
    apiKey: process.env.GEMINI_API_KEY || 'fake-key',
    temperature: 0.7,
  });
}

const chatRoute = createRoute({
  method: 'post',
  path: '/{businessId}/playground/chat',
  tags: ['Playground'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: z.object({ message: z.string().min(1), persona: z.string().optional() }) } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ reply: z.string() }) } }, description: 'Reply' },
  },
});

playgroundRouter.openapi(chatRoute, async (c) => {
  const { businessId } = c.req.param();
  const { message, persona } = c.req.valid('json');
  const llm = getLlm();
  const res = await llm.invoke([
    { role: 'system', content: `You are an OnlyOrders AI sales agent for business ${businessId}. Customer persona: ${persona ?? 'Oliver Queen'}. Reply helpfully and concisely.` },
    { role: 'user', content: message },
  ]);
  const reply = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
  return c.json({ reply }, 200);
});
