import { notFound } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3500';

type StoreProduct = {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  categoryName?: string | null;
  thumbnailUrl?: string | null;
};

type Store = {
  slug: string;
  name: string;
  description?: string | null;
  phone?: string | null;
  products: StoreProduct[];
};

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await fetch(`${API}/api/v1/store/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (!res.ok) notFound();
  const store = (await res.json()) as Store;

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <h1 className="text-3xl font-bold">{store.name}</h1>
          {store.description && (
            <p className="mt-2 max-w-2xl text-neutral-600">{store.description}</p>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        {store.products.length === 0 ? (
          <p className="text-neutral-500">No products yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {store.products.map((p) => (
              <article
                key={p.id}
                className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm"
              >
                <div className="flex aspect-square items-center justify-center bg-neutral-100">
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-4xl text-neutral-300">🛍️</span>
                  )}
                </div>
                <div className="p-4">
                  {p.categoryName && (
                    <p className="text-xs uppercase tracking-wide text-neutral-400">{p.categoryName}</p>
                  )}
                  <h2 className="mt-1 font-semibold">{p.name}</h2>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{p.description}</p>
                  )}
                  <p className="mt-3 text-lg font-bold">${p.price.toFixed(2)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-neutral-200 py-6 text-center text-sm text-neutral-400">
        Powered by Oryxa
      </footer>
    </main>
  );
}
