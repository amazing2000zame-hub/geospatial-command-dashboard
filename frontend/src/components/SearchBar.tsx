import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
      }}
    >
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search city or coordinates (lat, lng)..."
          style={{
            padding: '12px 20px',
            fontSize: '16px',
            width: '400px',
            border: '2px solid #333',
            borderRadius: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#0066cc';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#333';
          }}
        />
      </form>
    </div>
  );
}

export default SearchBar;
