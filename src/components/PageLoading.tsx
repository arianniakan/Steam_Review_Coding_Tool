export function PageLoading() {
  return (
    <main className="mx-auto flex max-w-3xl items-center justify-center p-4 py-24 sm:p-8">
      <div className="flex flex-col items-center gap-3 text-sm text-gray-500">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        Loading…
      </div>
    </main>
  );
}
