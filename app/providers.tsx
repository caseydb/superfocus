'use client';

import { Provider } from 'react-redux';
import { store } from './store/store';
import { ReduxInitializer } from './redux-initializer';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ReduxInitializer>{children}</ReduxInitializer>
    </Provider>
  );
}