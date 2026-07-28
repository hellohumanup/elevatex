type VotarLinkStatusProps = {
  title: string;
  message: string;
  eyebrow?: string;
};

export default function VotarLinkStatus({
  title,
  message,
  eyebrow = "Evaluación EDT · ElevateX",
}: VotarLinkStatusProps) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800/80 bg-slate-900/60 p-10 text-center shadow-2xl shadow-black/40 ring-1 ring-white/5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400/90">
          {eyebrow}
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">{message}</p>
      </div>
    </div>
  );
}
