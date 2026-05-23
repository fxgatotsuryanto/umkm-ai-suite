import Link from "next/link";

export default function Home() {
  const modules = [
    {
      title: "WA Auto-Reply",
      desc: "Balas pesan WhatsApp otomatis dengan AI",
      href: "/wa",
      icon: "💬",
      status: "active",
    },
    {
      title: "Konten Marketing",
      desc: "Generate konten Instagram, TikTok, Facebook",
      href: "/content",
      icon: "✨",
      status: "active",
    },
    {
      title: "Produk & FAQ",
      desc: "Kelola produk dan pertanyaan umum",
      href: "/products",
      icon: "📦",
      status: "active",
    },
    {
      title: "Token & Billing",
      desc: "Cek saldo dan riwayat penggunaan",
      href: "/tokens",
      icon: "🪙",
      status: "active",
    },
  ];

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900">UMKM AI Suite 🚀</h1>
          <p className="text-gray-500 mt-2">
            AI Suite untuk WA Auto-Reply & Konten Marketing otomatis
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className="block p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all"
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl">{mod.icon}</span>
                <div>
                  <h2 className="font-semibold text-gray-900">{mod.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">{mod.desc}</p>
                  {mod.status === "active" && (
                    <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                      Aktif
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
          Backend berjalan di{" "}
          <code className="font-mono">http://localhost:8000</code> —{" "}
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Buka API Docs
          </a>
        </div>
      </div>
    </main>
  );
}
