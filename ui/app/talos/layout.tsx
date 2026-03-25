export default function TalosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto container py-6">{children}</div>
    </div>
  );
}
