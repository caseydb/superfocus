'use client';

import { Provider } from 'react-redux';
import { store } from './store/store';
import { ReduxInitializer } from './redux-initializer';
import { InstanceProvider } from './Components/Instances';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <InstanceProvider>
        <ReduxInitializer>{children}</ReduxInitializer>
      </InstanceProvider>
    </Provider>
  );
}