"use client";
// The theme editor (T353; FR-093, FR-095): pick a brand, edit its token file as JSON or upload one,
// and save it through the api. A refused file comes back with every failure listed: a missing
// variable, an unsafe value, or a text pair under 4.5:1 with its ratio. A save names the version it
// started from, so a save made in the meantime by someone else is refused instead of overwritten.
import type { BrandTokensView } from "@clever/contracts/brand";
import { ApiError } from "@clever/contracts/client";
import { Button, Card, FilePicker, Select, TextField } from "@clever/ui";
import Link from "next/link";
import { useState } from "react";
import { useBrands } from "@/brand/BrandProvider";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { describeError } from "@/lib/errors";
import { useBrandTokens, useSaveBrandTokens } from "./queries";

function TokenForm({ loaded }: { loaded: BrandTokensView }) {
  const [text, setText] = useState(() => JSON.stringify(loaded.tokens, null, 2));
  const [notJson, setNotJson] = useState(false);
  const save = useSaveBrandTokens();
  const problems = save.error instanceof ApiError ? save.error.fields : [];

  function onSave() {
    let tokens: unknown;
    try {
      tokens = JSON.parse(text);
    } catch {
      setNotJson(true);
      return;
    }
    setNotJson(false);
    save.mutate({ brandId: loaded.brandId, tokens, tokenVersion: loaded.tokenVersion });
  }

  return (
    <Card
      title={`Tokens, version ${loaded.tokenVersion}`}
      description="DTCG tokens. Every variable the theme reads must be present, and every text pair must reach 4.5:1."
      actions={
        <FilePicker
          label="Upload a token file"
          acceptedTypes={[".json", "application/json"]}
          onSelect={([file]) => void file?.text().then(setText)}
        />
      }
    >
      <TextField
        label="Token file"
        value={text}
        onChange={setText}
        rows={24}
        spellCheck="false"
        errorMessage={notJson ? "This is not valid JSON" : undefined}
      />
      {save.isError && (
        <ErrorNotice error={describeError(save.error, "The tokens could not be saved.")}>
          {problems.length > 0 && (
            <ul className="list-disc pl-inset-lg">
              {problems.map((p) => (
                <li key={`${p.field} ${p.message}`}>
                  <code>{p.field}</code>: {p.message}
                </li>
              ))}
            </ul>
          )}
        </ErrorNotice>
      )}
      <div className="flex flex-wrap items-center gap-inline-md">
        <Button onPress={onSave} isPending={save.isPending}>
          Save tokens
        </Button>
        <Link href="/design-system" className="text-body text-link hover:text-link-hover">
          Open the style guide
        </Link>
        <p role="status" className="text-helper text-muted">
          {save.data && `Saved as version ${save.data.tokenVersion}.`}
        </p>
      </div>
    </Card>
  );
}

function BrandTokens({ brandId }: { brandId: string }) {
  const { data, isPending, isError, error } = useBrandTokens(brandId);
  if (isPending) return <p role="status">Loading the tokens…</p>;
  if (isError) {
    return <ErrorNotice error={describeError(error, "The tokens could not be loaded.")} />;
  }
  // A new version (this save or another operator's) starts the form again from the stored file.
  return <TokenForm key={data.tokenVersion} loaded={data} />;
}

export function BrandEditor() {
  const brands = useBrands();
  const [brandId, setBrandId] = useState(brands[0]?.brandId ?? "");

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="w-72">
        <Select
          label="Brand"
          options={brands.map((b) => ({ id: b.brandId, label: b.displayName }))}
          selectedKey={brandId}
          onSelectionChange={(key) => key !== null && setBrandId(String(key))}
        />
      </div>
      {brandId && <BrandTokens key={brandId} brandId={brandId} />}
    </div>
  );
}
