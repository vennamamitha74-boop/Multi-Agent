import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-[#F8FAFC]">
      <h1 className="text-4xl font-bold text-slate-800">404 - Page Not Found</h1>
      <p className="mt-3 text-slate-600">The requested page does not exist.</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-[#B3CDE3] px-5 py-2.5 font-medium text-slate-900 transition hover:bg-[#9BBEDC]"
      >
        Return to Home
      </Link>
    </div>
  );
}

