import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">__PROJECT_NAME__</h1>
        <p className="mb-8 text-lg text-gray-600">__DESCRIPTION__</p>
        <Link
          href="/chat"
          className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          Open Chat
        </Link>
      </div>
    </main>
  );
}
