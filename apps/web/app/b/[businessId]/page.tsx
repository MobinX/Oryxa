import { redirect } from 'next/navigation';

export default async function BusinessIndex({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  redirect(`/b/${businessId}/dashboard`);
}
