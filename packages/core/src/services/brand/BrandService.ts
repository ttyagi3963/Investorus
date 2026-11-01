// The brands (T348; FR-092, FR-093, FR-095): the list for the switcher and host mapping, a brand's
// theme as the web app renders it, and operations replacing a brand's tokens. A token set is checked
// with the same validator the seed uses; one that is unsafe, misses a variable the theme reads, or has
// a text pair under WCAG AA is refused with each failure as a field error. A save names the version
// the editor loaded and is refused if another save came first (T353). A saved theme bumps the
// brand's version (caches replace it) and is audited.
import type { Actor } from "@clever/contracts/auth";
import {
  brandContentSchema,
  validateBrandTokens,
  type BrandSummary,
  type BrandThemeView,
  type BrandTokensView,
} from "@clever/contracts/brand";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@clever/contracts/common";
import { z } from "zod";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";

const NOT_FOUND = "Brand not found";
const themeInputSchema = z.object({ tokens: z.unknown(), tokenVersion: z.int().min(1) });

function requireOps(actor: Actor): void {
  if (actor.role !== "OPS") throw new ForbiddenError("Only operations can change a brand");
}

export interface IBrandService {
  list(): Promise<BrandSummary[]>;
  getTheme(brandId: string): Promise<BrandThemeView>;
  getTokens(actor: Actor, brandId: string): Promise<BrandTokensView>;
  updateTheme(actor: Actor, brandId: string, input: unknown): Promise<BrandThemeView>;
}

export class BrandService implements IBrandService {
  constructor(private readonly uow: IUnitOfWork) {}

  async list(): Promise<BrandSummary[]> {
    const brands = await this.uow.run((repos) => repos.brands.list());
    return brands.map((b) => ({ brandId: b.id, displayName: b.name, hosts: b.hosts }));
  }

  async getTheme(brandId: string): Promise<BrandThemeView> {
    const brand = await this.uow.run((repos) => repos.brands.findById(brandId));
    if (!brand) throw new NotFoundError(NOT_FOUND);
    const checked = validateBrandTokens(brand.tokens);
    const content = brandContentSchema.safeParse(brand.content);
    // Stored data passed the same checks when saved; failing now means it was changed outside.
    if (!checked.ok || !content.success) {
      throw new InfrastructureError(`The ${brandId} brand's stored theme is unusable`, 502);
    }
    return {
      brandId,
      tokenVersion: brand.tokenVersion,
      cssVariables: checked.variables,
      fontFamily: checked.fontFamily,
      content: content.data,
    };
  }

  async getTokens(actor: Actor, brandId: string): Promise<BrandTokensView> {
    requireOps(actor);
    const brand = await this.uow.run((repos) => repos.brands.findById(brandId));
    if (!brand) throw new NotFoundError(NOT_FOUND);
    return { brandId, tokenVersion: brand.tokenVersion, tokens: brand.tokens };
  }

  async updateTheme(actor: Actor, brandId: string, input: unknown): Promise<BrandThemeView> {
    requireOps(actor);
    const { tokens, tokenVersion: loaded } = themeInputSchema.parse(input);
    const checked = validateBrandTokens(tokens);
    if (!checked.ok) {
      throw new ValidationError("This token set cannot be used", checked.problems);
    }
    await this.uow.run(async (repos) => {
      if (!(await repos.brands.findById(brandId))) throw new NotFoundError(NOT_FOUND);
      const tokenVersion = await repos.brands.updateTokens(brandId, tokens, loaded);
      if (tokenVersion === null) {
        throw new ConflictError(
          "This brand was changed since you opened it; reload to see the change",
        );
      }
      await repos.audit.append({
        actorType: "USER",
        actorId: actor.userId,
        action: "BRAND_THEME_UPDATED",
        entityType: "Brand",
        entityId: brandId,
        outcome: "SUCCESS",
        details: { tokenVersion },
      });
    });
    return this.getTheme(brandId);
  }
}
