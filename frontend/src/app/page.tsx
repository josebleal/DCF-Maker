import { Header } from "@/components/layout/Header";
import { CompanyHeader } from "@/components/layout/CompanyHeader";
import { MainTabs } from "@/components/layout/MainTabs";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <CompanyHeader />
      <main className="flex-1">
        <MainTabs />
      </main>
    </div>
  );
}
