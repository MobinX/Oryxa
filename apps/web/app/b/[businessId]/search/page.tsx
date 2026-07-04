import Link from 'next/link';
import { getBusinessForRequest, searchBusinessForRequest } from '@/lib/server-data';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchBar } from '@/components/search-bar';
import {
  Package,
  FolderTree,
  ShoppingCart,
  MessageSquare,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { businessId } = await params;
  const { q = '' } = await searchParams;
  const business = await getBusinessForRequest(businessId);

  let results = { products: [], categories: [], orders: [], messages: [] };
  if (q.trim()) {
    try {
      results = await searchBusinessForRequest(businessId, q);
    } catch (e) {
      console.error('Search error:', e);
    }
  }

  const hasResults =
    results.products.length > 0 ||
    results.categories.length > 0 ||
    results.orders.length > 0 ||
    results.messages.length > 0;

  return (
    <div className="space-y-8">
      {/* Top Header with search input */}
      <div className="flex flex-col gap-4 border-b border-border/40 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Search Results</h1>
          <p className="text-sm text-muted-foreground">
            Search results for &ldquo;<span className="font-semibold text-foreground">{q}</span>&rdquo; in {business.name}.
          </p>
        </div>
        <div className="w-full md:max-w-md">
          <SearchBar businessId={businessId} initialQuery={q} />
        </div>
      </div>

      {!q.trim() ? (
        <Card className="p-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xl">
            🔍
          </div>
          <h3 className="font-semibold text-lg">Start searching</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Type anything in the search bar above to look up products, orders, categories, and messages.
          </p>
        </Card>
      ) : !hasResults ? (
        <Card className="p-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center text-xl">
            ✕
          </div>
          <h3 className="font-semibold text-lg">No results found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            We couldn&apos;t find anything matching &ldquo;{q}&rdquo;. Try checking spelling or using different keywords.
          </p>
          <div className="pt-2">
            <Link href={`/b/${businessId}/dashboard`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold">
              Go back dashboard <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Products Results */}
          {results.products.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <Package className="h-5 w-5 text-purple-500" />
                <h2 className="text-lg font-bold text-foreground">Products ({results.products.length})</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.products.map((product: any) => (
                  <Link key={product.id} href={`/b/${businessId}/products`} className="block group">
                    <Card className="p-5 hover:scale-[1.01] transition-all duration-200 hover:border-purple-500/30">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {product.name}
                        </h3>
                        <span className="text-sm font-extrabold text-purple-600 dark:text-purple-400">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(product.price)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                        {product.description || 'No description available.'}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Categories Results */}
          {results.categories.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <FolderTree className="h-5 w-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-foreground">Categories ({results.categories.length})</h2>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {results.categories.map((cat: any) => (
                  <Link key={cat.id} href={`/b/${businessId}/categories`}>
                    <Badge variant="outline" className="text-sm py-1.5 px-3.5 hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30 transition-all cursor-pointer">
                      🏷️ {cat.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Orders Results */}
          {results.orders.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <ShoppingCart className="h-5 w-5 text-rose-500" />
                <h2 className="text-lg font-bold text-foreground">Orders ({results.orders.length})</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {results.orders.map((order: any) => {
                  const stateColors: Record<string, string> = {
                    pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                    processing: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                    completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                    cancelled: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
                  };
                  return (
                    <Link key={order.id} href={`/b/${businessId}/orders`} className="block">
                      <Card className="p-4 flex items-center justify-between gap-4 hover:border-rose-500/30 transition-colors">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate text-foreground">{order.customerName}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {new Date(order.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${stateColors[order.state] || 'bg-slate-500/10 text-slate-600'}`}>
                            {order.state}
                          </span>
                          <span className="text-sm font-extrabold text-foreground">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(order.totalPrice)}
                          </span>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Messages / Conversations Results */}
          {results.messages.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <MessageSquare className="h-5 w-5 text-blue-500" />
                <h2 className="text-lg font-bold text-foreground">Messages ({results.messages.length})</h2>
              </div>
              <div className="space-y-3">
                {results.messages.map((msg: any) => {
                  const isAgent = msg.from === 'self';
                  return (
                    <Link key={msg.id} href={`/b/${businessId}/inbox`} className="block group">
                      <Card className="p-4 hover:bg-muted/15 transition-all hover:border-blue-500/20">
                        <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-2 mb-2">
                          <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                            Chat with <span className="text-foreground font-bold">{msg.customerName || 'Customer'}</span>
                          </span>
                          <span className="text-[10px] text-[var(--muted-foreground)]">
                            {new Date(msg.time).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className={`flex gap-3 items-start ${isAgent ? 'justify-end' : ''}`}>
                          {!isAgent && (
                            <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              C
                            </div>
                          )}
                          <div className={`rounded-2xl px-4 py-2 text-sm leading-relaxed max-w-[85%] ${
                            isAgent
                              ? 'bg-primary text-primary-foreground rounded-tr-none'
                              : 'bg-muted text-foreground rounded-tl-none'
                          }`}>
                            {msg.content}
                          </div>
                          {isAgent && (
                            <div className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              AI
                            </div>
                          )}
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
