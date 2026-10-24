export interface Advisory {
  id: string;
  package: string;
  severity: string;
  title: string;
}

export declare function gatedAdvisories(report: unknown): Map<string, Advisory>;

export declare function compareToBaseline<B extends { id: string }>(
  found: Map<string, Advisory>,
  baseline: B[],
): { added: Advisory[]; resolved: B[] };
