import {
  Children,
  cloneElement,
  isValidElement,
  Fragment,
  Suspense,
  useMemo,
  type ReactNode,
} from 'react';
import { Route, Routes as RouterRoutes } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

function RouteLoadingFallback() {
  const { t } = useTranslation();
  return (
    <PageContainer data-route-loading>
      <PageLoadingState count={2} label={t('common.loadingPage', 'Loading this station')} />
    </PageContainer>
  );
}

/** Catch a lazy page below route matching, so resolving it does not rebuild and
 * recompile the entire route table. Layouts/guards retain their router context. */
function isolatePages(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; element?: ReactNode }>(child)) return child;
    if (
      child.type === Fragment ||
      (child.type === Route && Children.count(child.props.children) > 0)
    ) {
      return cloneElement(child, { children: isolatePages(child.props.children) });
    }
    if (child.type !== Route || child.props.element == null) return child;
    return cloneElement(child, {
      element: <Suspense fallback={<RouteLoadingFallback />}>{child.props.element}</Suspense>,
    });
  });
}

export function RoutesWithLeafSuspense({ children }: { children: ReactNode }) {
  const routes = useMemo(() => isolatePages(children), [children]);
  return <RouterRoutes>{routes}</RouterRoutes>;
}
