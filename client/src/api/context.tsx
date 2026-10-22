import { createContext, useContext, type ReactNode } from 'react';
import type { TransportClient } from './client';

const TransportContext = createContext<TransportClient | null>(null);

export function TransportProvider({
  client,
  children,
}: {
  client: TransportClient;
  children: ReactNode;
}) {
  return <TransportContext.Provider value={client}>{children}</TransportContext.Provider>;
}

export function useTransportClient(): TransportClient {
  const client = useContext(TransportContext);
  if (!client) throw new Error('useTransportClient must be used inside <TransportProvider>');
  return client;
}
