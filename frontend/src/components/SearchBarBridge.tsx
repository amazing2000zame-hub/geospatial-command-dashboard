import SearchBar from './SearchBar';
import { useGlobe } from './Globe';

/** Adapter that passes getViewer from Globe context to SearchBar */
function SearchBarBridge() {
  const { getViewer } = useGlobe();
  return <SearchBar getViewer={getViewer} />;
}

export default SearchBarBridge;
