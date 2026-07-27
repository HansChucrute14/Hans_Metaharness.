import { DocReader } from "@/components/docs/doc-reader";
import { ErrorBoundary } from "@/components/error-boundary";

export default function Home() {
  return (
    <ErrorBoundary label="the documentation reader">
      <DocReader />
    </ErrorBoundary>
  );
}
