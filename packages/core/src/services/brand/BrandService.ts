// The brands (T348; FR-092, FR-093, FR-095): the list for the switcher and host mapping, a brand's
// theme as the web app renders it, and operations replacing a brand's tokens. A token set is checked
// with the same validator the seed uses; one that is unsafe, misses a variable the theme reads, or has
// a text pair under WCAG AA is refused with each failure as a field error. A saved theme bumps the
// brand's version (caches replace it) and is audited.
import type { Actor } from "@clever/contracts/auth";
import {
  brandContentSchema,
  validateBrandTokens,
  type BrandSummary,
  type BrandThemeView,
} from "@clever/contracts/brand";
import { ForbiddenError, NotFoundError, ValidationError } from "@clever/contracts/common";
import { z } from "zod";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";

const NOT_FOUND = "Brand not found";
const themeInputSchema = z.object({ tokens: z.unknown() });

export interface IBrandService {
  list(): Promise<BrandSummary[]>;
  getTheme(brandId: string): Promise<BrandThemeView>;
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
    // Stored tokens passed the same check when saved; failing now means the data was changed outside.
    if (!checked.ok) throw new InfrastructureError(`The ${brandId} brand's stored tokens are unusable`, 502);
    return {
      brandId,
      tokenVersion: brand.tokenVersion,
      cssVariables: checked.variables,
      fontFamily: checked.fontFamily,
      content: brandContentSchema.parse(brand.content),
    };
  }

  async updateTheme(actor: Actor, brandId: string, input: unknown): Promise<BrandThemeView> {
    if (actor.role !== "OPS") throw new ForbiddenError("Only operations can change a brand");
    const { tokens } = themeInputSchema.parse(input);
    const checked = validateBrandTokens(tokens);
    if (!checked.ok) {
      throw new ValidationError("This token set cannot be used", checked.problems);
    }
    await this.uow.run(async (repos) => {
      if (!(await repos.brands.findById(brandId))) throw new NotFoundError(NOT_FOUND);
      const tokenVersion = await repos.brands.updateTokens(brandId, tokens);
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
