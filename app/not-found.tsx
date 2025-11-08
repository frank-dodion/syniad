export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 flex items-center justify-center text-white">
      <div className="text-center p-8 max-w-2xl">
        <h1 className="text-6xl font-bold mb-4 drop-shadow-lg">404</h1>
        <p className="text-xl mb-8 opacity-90">Page Not Found</p>
        <p className="text-lg mb-8 opacity-80">
          The page you're looking for doesn't exist.
        </p>
        <a 
          href="/" 
          className="bg-white/30 hover:bg-white/50 border-2 border-white text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 inline-block"
        >
          Go Home
        </a>
      </div>
    </div>
  );
}

