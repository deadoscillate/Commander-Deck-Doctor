import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisReport } from "@/components/AnalysisReport";
import { ExportButtons } from "@/components/ExportButtons";
import { getReport, isValidReportHash } from "@/lib/reportStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportPageProps = {
  params: Promise<{
    hash: string;
  }>;
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { hash } = await params;
  if (!isValidReportHash(hash)) {
    notFound();
  }

  const report = getReport(hash);
  if (!report) {
    notFound();
  }

  return (
    <main className="page">
      <div className="hero">
        <h1>Commander Deck Doctor</h1>
        <p>
          Shared analysis report. Last updated: <strong>{formatTimestamp(report.updatedAt)}</strong>.
        </p>
        <p>
          <Link href="/" className="inline-link">
            Analyze another deck
          </Link>
        </p>
      </div>

      <section className="panel-grid panel-grid-single">
        <div className="panel results-panel">
          <ExportButtons result={report.analysis} decklist={report.decklist} />
          <AnalysisReport result={report.analysis} />
        </div>
      </section>
    </main>
  );
}
