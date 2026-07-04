'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface SearchBarProps {
  businessId: string;
  placeholder?: string;
  initialQuery?: string;
}

export function SearchBar({ businessId, placeholder = 'Search anything...', initialQuery = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/b/${businessId}/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative flex-1 max-w-md">
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full h-11 pl-4 pr-10 rounded-xl border border-border/80 bg-card/50 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
      />
      <button type="submit" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
        <Search className="h-4 w-4" />
      </button>
    </form>
  );
}
