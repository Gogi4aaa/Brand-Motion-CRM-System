import { StoreProvider } from "@/components/store";
import { AppReady } from "@/components/AppReady";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <AppReady>{children}</AppReady>
    </StoreProvider>
  );
}
