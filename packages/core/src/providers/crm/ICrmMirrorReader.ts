// Reads the CRM's copy of each listing (T341; FR-078), so operations can compare it with the platform.
// The api holds this port; it reads the CRM and never writes to it.
export type CrmMirrorRecord = { packageId: string; status: string; occurredAt: Date };

export interface ICrmMirrorReader {
  listListings(): Promise<CrmMirrorRecord[]>;
}
