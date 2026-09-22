import { useRoutes, type Location } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { createMainRoutes } from '@/router/routeConfig';

export function MainRoutes({ location }: { location?: Location }) {
  const supportsPlugin = useAuthStore((state) => state.supportsPlugin);
  return useRoutes(createMainRoutes(supportsPlugin), location);
}
