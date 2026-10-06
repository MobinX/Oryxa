import type { StoreTheme } from '@/lib/storefront';
import { cn } from '@/lib/utils';

type StorefrontHeroProps = {
  store: {
    name: string;
    description?: string | null;
    phone?: string | null;
    theme: StoreTheme;
  };
  total: number;
};

/**
 * Full-bleed opening band: photography when the store supplied a hero image,
 * otherwise an oversized typographic plate on the dot-textured paper.
 */
export function StorefrontHero({ store, total }: StorefrontHeroProps) {
  const heroUrl = store.theme?.heroImageUrl ?? null;

  return (
    <section
      data-store-hero
      className={cn(
        'relative isolate overflow-hidden border-b border-[#E4E1DB]',
        heroUrl ? 'bg-[#141414]' : 'store-plate bg-[#FBFAF8]',
      )}
    >
      {heroUrl ? (
        <>
          <img
            src={heroUrl}
            alt=""
            aria-hidden
            loading="eager"
            decoding="async"
            // eslint-disable-next-line @next/next/no-img-element
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f]/80 via-[#0f0f0f]/30 to-[#0f0f0f]/5"
          />
        </>
      ) : null}

      <div className="mx-auto w-full max-w-[1560px] px-5 sm:px-8 lg:px-12">
        <div className="relative flex min-h-[54vh] flex-col justify-end py-16 sm:min-h-[62vh] md:min-h-[70vh] md:py-24">
          <p
            className={cn(
              'text-[10px] uppercase tracking-[0.3em]',
              heroUrl ? 'text-white/65' : 'text-[#a29d96]',
            )}
          >
            {total > 0
              ? `${total} ${total === 1 ? 'piece' : 'pieces'} · The collection`
              : 'Coming soon · The collection'}
          </p>

          <h1
            data-store-hero-title
            className={cn(
              'store-fade mt-5 max-w-[16ch] text-[clamp(2.6rem,8.5vw,7rem)] leading-[0.94] tracking-[-0.015em]',
              heroUrl ? 'text-white' : 'text-[#141414]',
            )}
            style={{ fontFamily: 'var(--store-font)' }}
          >
            {store.name}
          </h1>

          {store.description ? (
            <p
              className={cn(
                'mt-6 max-w-[46ch] text-[14px] leading-[1.75] sm:text-[15px]',
                heroUrl ? 'text-white/80' : 'text-[#6b6b6b]',
              )}
            >
              {store.description}
            </p>
          ) : null}

          {total > 0 ? (
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <a
                href="#collection"
                className={cn(
                  'inline-flex h-11 items-center px-8 text-[10.5px] uppercase tracking-[0.26em]',
                  'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  heroUrl
                    ? 'bg-white text-[#141414] hover:bg-[#EDEAE4]'
                    : 'bg-[var(--store-accent)] text-[var(--store-accent-fg)] hover:opacity-90',
                )}
              >
                Shop the collection
              </a>
              {store.phone ? (
                <a
                  href={`tel:${store.phone.replace(/[^+\d]/g, '')}`}
                  className={cn(
                    'nav-rule inline-flex h-11 items-center text-[10.5px] uppercase tracking-[0.26em] transition-colors duration-300',
                    heroUrl ? 'text-white/85 hover:text-white' : 'text-[#6b6b6b] hover:text-[#141414]',
                  )}
                >
                  Client services
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
