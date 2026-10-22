import { Bot, CreditCard, LayoutDashboard, MessageCircle, Truck } from 'lucide-react';
import { Reveal, SectionHeading } from '@/components/marketing/primitives';

const FEATURES = [
  { icon: Bot, span: 'lg:col-span-7', title: 'Messenger AI replies', copy: 'Answers price, size and stock questions in seconds, in your shop’s tone — and hands off to you when it matters.', demo: ['Is the blue kurti in M?', 'Yes! 3 left in M — want me to reserve one?'] },
  { icon: CreditCard, span: 'lg:col-span-5', title: 'Checkout inside the chat', copy: 'Customers confirm the cart, address and payment without leaving Messenger.', demo: ['Total ৳1,450 · Cash on delivery', 'Order #OO-2481 confirmed ✓'] },
  { icon: LayoutDashboard, span: 'lg:col-span-5', title: 'One orders dashboard', copy: 'Every chat order lands in a single board with status, notes and totals.', demo: ['12 new · 8 packed · 21 shipped'] },
  { icon: Truck, span: 'lg:col-span-7', title: 'Courier tracking, auto-shared', copy: 'Book the courier in one tap; tracking updates are sent back to the buyer’s chat.', demo: ['Picked up → In transit → Out for delivery'] },
];

const STEPS = [
  { n: '01', title: 'Connect your Page', copy: 'Link Facebook Messenger and import your catalog.' },
  { n: '02', title: 'Let AI take the chats', copy: 'Replies, carts and confirmations run on autopilot.' },
  { n: '03', title: 'Ship and track', copy: 'Push orders to your courier and watch them move.' },
];

export function HomeBento() {
  return (
    <section id="features" className="relative py-16 text-white lg:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Conversational commerce" icon={<MessageCircle className="h-3.5 w-3.5" />} title="From first message" gradient="to delivered order." copy="Everything a chat-first store needs, in one place." />
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {FEATURES.map(({ icon: Icon, span, title, copy, demo }, i) => (
            <Reveal key={title} delayMs={i * 60} className={span}>
              <article className="flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-6 sm:p-8">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5B3DF5]/15 text-violet-300"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-xl font-semibold sm:text-2xl">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base">{copy}</p>
                <div className="mt-6 space-y-2">
                  {demo.map((d, j) => (
                    <p key={d} className={`w-fit max-w-full rounded-2xl px-3 py-2 text-xs sm:text-sm ${j % 2 ? 'ml-auto bg-[#5B3DF5]/25 text-violet-100' : 'bg-white/[0.06] text-slate-300'}`}>{d}</p>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        <div id="how-it-works" className="mt-20">
          <h2 className="text-center text-[28px] font-semibold tracking-tight lg:text-[40px]">Live in three steps</h2>
          <ol className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <span className="font-mono text-sm text-violet-300">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{s.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
