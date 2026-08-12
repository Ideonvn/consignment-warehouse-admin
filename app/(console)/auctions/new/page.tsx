"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { IncrementRulesEditor } from "@/components/auctions/IncrementRulesEditor";
import { Button } from "@/components/ui/Button";
import { DateTimeInput } from "@/components/ui/DateTimeInput";
import { Field } from "@/components/ui/Field";
import { Note } from "@/components/ui/Feedback";
import { Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Panel } from "@/components/ui/Panel";
import { PremiumField } from "@/components/auctions/PremiumField";
import {
  confirmAuctionImage,
  createAuction,
  createIncrementRule,
  presignAuctionImage,
} from "@/lib/api/endpoints";
import { postToStorage, StorageUploadError, validateImageFile } from "@/lib/api/upload";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useAuctionInvalidation } from "@/lib/api/queries";
import { formatCountdown } from "@/lib/format/datetime";
import { slugify } from "@/lib/format/slug";
import { useNow } from "@/lib/ui/hooks";
import type { IncrementBand } from "@/lib/format/increments";
import { ALLOWED_IMAGE_TYPES, AUCTION_SLUG_RE } from "@/types/api";

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Give the auction a name"),
    slug: z
      .string()
      .trim()
      .min(1, "A slug is required")
      .regex(
        AUCTION_SLUG_RE,
        "Lowercase letters, numbers and hyphens only, starting with a letter or number",
      ),
    description: z.string().trim().optional(),
    image_url: z.string().trim().optional(),
    starts_at: z.string().min(1, "Set an opening time"),
    ends_at: z.string().min(1, "Set a closing time"),
    currency_code: z
      .string()
      .trim()
      .length(3, "Use a three-letter ISO code, e.g. ZAR")
      .transform((v) => v.toUpperCase()),
    anti_snipe_window_seconds: z.number().int().min(0).max(3600),
    anti_snipe_extension_seconds: z.number().int().min(0).max(3600),
    max_extensions: z.number().int().min(0).max(1000),
    deposit_amount_minor: z.number().int().min(0),
    buyers_premium_bps: z.number().int().min(0).max(10000),
  })
  .refine((data) => Date.parse(data.ends_at) > Date.parse(data.starts_at), {
    message: "The closing time must be after the opening time",
    path: ["ends_at"],
  });

type FormValues = z.input<typeof formSchema>;

function inOneHour(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function inOneWeek(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

export default function NewAuctionPage() {
  const router = useRouter();
  const invalidate = useAuctionInvalidation();
  const [bands, setBands] = useState<IncrementBand[]>([]);
  // Presign is scoped to an auction that exists, so a file cannot be uploaded
  // until after creation. Same shape as the increment rules below: collect the
  // choice here, apply it once there is an auction to attach it to.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      image_url: "",
      starts_at: inOneHour(),
      ends_at: inOneWeek(),
      currency_code: "ZAR",
      anti_snipe_window_seconds: 300,
      anti_snipe_extension_seconds: 300,
      max_extensions: 20,
      deposit_amount_minor: 0,
      buyers_premium_bps: 0,
    },
  });

  const values = useWatch({ control });

  const mutation = useMutation({
    mutationFn: async (input: FormValues) => {
      const parsed = formSchema.parse(input);
      const auction = await createAuction({
        slug: parsed.slug,
        name: parsed.name,
        description: parsed.description || null,
        image_url: parsed.image_url || null,
        starts_at: parsed.starts_at,
        ends_at: parsed.ends_at,
        currency_code: parsed.currency_code,
        anti_snipe_window_seconds: parsed.anti_snipe_window_seconds,
        anti_snipe_extension_seconds: parsed.anti_snipe_extension_seconds,
        max_extensions: parsed.max_extensions,
        deposit_amount_minor: parsed.deposit_amount_minor,
        buyers_premium_bps: parsed.buyers_premium_bps,
      });

      // Rules can only be attached once the auction exists.
      const failed: string[] = [];
      for (const band of bands) {
        try {
          await createIncrementRule(auction.id, {
            min_price_minor: band.minPriceMinor,
            increment_minor: band.incrementMinor,
          });
        } catch (error) {
          failed.push(errorMessage(error));
        }
      }
      // The auction exists from here on. An image failure is reported, never
      // fatal — losing a created auction over a cover photo would be absurd.
      let imageFailure: string | null = null;
      if (imageFile) {
        try {
          const presign = await presignAuctionImage(auction.id, {
            content_type: imageFile.type,
            size_bytes: imageFile.size,
          });
          await postToStorage(presign, imageFile);
          await confirmAuctionImage(auction.id, presign.storage_key);
        } catch (error) {
          imageFailure =
            error instanceof StorageUploadError
              ? error.message
              : `The API rejected the image: ${errorMessage(error)}`;
        }
      }

      return { auction, failed, imageFailure };
    },
    onSuccess: ({ auction, failed, imageFailure }) => {
      invalidate(auction.id);
      if (failed.length > 0) {
        toast.warning(
          `Auction created, but ${failed.length} increment rule(s) were rejected: ${failed[0]}`,
        );
      } else if (imageFailure) {
        toast.warning(
          `"${auction.name}" was created, but the cover image did not attach: ${imageFailure} You can add it from this screen.`,
        );
      } else {
        toast.success(`"${auction.name}" created as a draft`);
      }
      router.push(`/auctions/${auction.id}`);
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        toast.error("That slug is already taken. Pick another one.");
      } else {
        toast.error(errorMessage(error));
      }
    },
  });

  const durationMs =
    Date.parse(values.ends_at ?? "") - Date.parse(values.starts_at ?? "");
  const nowMs = useNow(30_000);
  const startsInPast =
    nowMs !== null && Date.parse(values.starts_at ?? "") <= nowMs;

  return (
    <>
      <PageHeader
        title="New auction"
        crumbs={[{ label: "Auctions", href: "/auctions" }, { label: "New" }]}
        subtitle="Created as a draft. Nothing is visible to bidders until you publish it."
      />

      <form
        onSubmit={handleSubmit((data) => mutation.mutateAsync(data))}
        className="flex max-w-3xl flex-col gap-4"
      >
        <Panel title="Identity">
          <div className="flex flex-col gap-3">
            <Field
              label="Name"
              htmlFor="name"
              required
              error={errors.name?.message}
            >
              <Input
                id="name"
                autoFocus
                invalid={Boolean(errors.name)}
                {...register("name", {
                  onChange: (event) => {
                    if (!slugTouched) {
                      setValue("slug", slugify(event.target.value), {
                        shouldValidate: true,
                      });
                    }
                  },
                })}
              />
            </Field>

            <Field
              label="Slug"
              htmlFor="slug"
              required
              error={errors.slug?.message}
              hint="Used in the bidder-facing URL. Lowercase letters, numbers and hyphens."
            >
              <div className="flex items-start gap-2">
                <Input
                  id="slug"
                  className="font-mono"
                  invalid={Boolean(errors.slug)}
                  {...register("slug", {
                    onChange: () => setSlugTouched(true),
                  })}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setValue("slug", slugify(values.name ?? ""), {
                      shouldValidate: true,
                    });
                    setSlugTouched(false);
                  }}
                >
                  From name
                </Button>
              </div>
            </Field>

            <Field
              label="Description"
              htmlFor="description"
              hint="Shown to bidders on the auction page."
            >
              <Textarea id="description" {...register("description")} />
            </Field>

            <Field
              label="Cover image"
              hint="Optional, and either way is fine — paste an address, or pick a file to upload once the auction exists. Lot photos are added per lot, not here."
              error={imageError}
            >
              <div className="flex flex-col gap-2">
                <Input
                  id="image_url"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/photo.jpg"
                  disabled={Boolean(imageFile)}
                  {...register("image_url")}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept={ALLOWED_IMAGE_TYPES.join(",")}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      if (!file) return;
                      const invalid = validateImageFile(file);
                      if (invalid) {
                        setImageError(invalid);
                        return;
                      }
                      setImageError(null);
                      setImageFile(file);
                      // One image, one source: a chosen file wins over the URL.
                      setValue("image_url", "");
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    {imageFile ? "Choose a different file" : "Upload a file"}
                  </Button>
                  {imageFile && (
                    <>
                      <span className="truncate text-xs text-text-muted">
                        {imageFile.name} · uploads after the auction is created
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setImageFile(null);
                          setImageError(null);
                        }}
                      >
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Field>
          </div>
        </Panel>

        <Panel
          title="Schedule"
          description="Entered in your local time, stored as UTC."
        >
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Opens"
                required
                error={errors.starts_at?.message}
                hint="Publishing is refused if this is already in the past."
              >
                <DateTimeInput
                  value={values.starts_at ?? null}
                  onChange={(iso) =>
                    setValue("starts_at", iso ?? "", { shouldValidate: true })
                  }
                  invalid={Boolean(errors.starts_at)}
                />
              </Field>

              <Field label="Closes" required error={errors.ends_at?.message}>
                <DateTimeInput
                  value={values.ends_at ?? null}
                  onChange={(iso) =>
                    setValue("ends_at", iso ?? "", { shouldValidate: true })
                  }
                  min={values.starts_at}
                  invalid={Boolean(errors.ends_at)}
                />
              </Field>
            </div>

            {Number.isFinite(durationMs) && durationMs > 0 && (
              <p className="text-xs text-text-muted">
                Runs for {formatCountdown(durationMs)}.
              </p>
            )}
            {startsInPast && (
              <Note tone="warning">
                The opening time is in the past. You can save this as a draft,
                but publishing will be refused until you move it forward.
              </Note>
            )}
          </div>
        </Panel>

        <Panel
          title="Bidding rules"
          description="Frozen once any lot in this auction has a bid."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Currency"
              htmlFor="currency_code"
              error={errors.currency_code?.message}
              hint="ISO 4217"
            >
              <Input
                id="currency_code"
                className="uppercase"
                maxLength={3}
                {...register("currency_code")}
              />
            </Field>

            <Field
              label="Anti-snipe window (s)"
              htmlFor="anti_snipe_window_seconds"
              error={errors.anti_snipe_window_seconds?.message}
              hint="Bids inside this window extend the lot."
            >
              <Input
                id="anti_snipe_window_seconds"
                type="number"
                min={0}
                className="tnum"
                {...register("anti_snipe_window_seconds", {
                  valueAsNumber: true,
                })}
              />
            </Field>

            <Field
              label="Extension (s)"
              htmlFor="anti_snipe_extension_seconds"
              error={errors.anti_snipe_extension_seconds?.message}
              hint="How far the close moves out."
            >
              <Input
                id="anti_snipe_extension_seconds"
                type="number"
                min={0}
                className="tnum"
                {...register("anti_snipe_extension_seconds", {
                  valueAsNumber: true,
                })}
              />
            </Field>

            <Field
              label="Max extensions"
              htmlFor="max_extensions"
              error={errors.max_extensions?.message}
              hint="Per lot."
            >
              <Input
                id="max_extensions"
                type="number"
                min={0}
                className="tnum"
                {...register("max_extensions", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="Bidder deposit"
              hint="What someone must hold in credit before they can bid here. Zero means no deposit."
            >
              <MoneyInput
                value={values.deposit_amount_minor ?? 0}
                currency={values.currency_code || "ZAR"}
                onChange={(minor) =>
                  setValue("deposit_amount_minor", minor ?? 0, {
                    shouldValidate: true,
                  })
                }
              />
            </Field>

            <PremiumField
              bps={values.buyers_premium_bps ?? 0}
              onChange={(bps) =>
                setValue("buyers_premium_bps", bps, { shouldValidate: true })
              }
            />
          </div>

          <Note tone="info" className="mt-3">
            A bid in the last{" "}
            {formatCountdown((values.anti_snipe_window_seconds ?? 0) * 1000)}{" "}
            pushes that lot&apos;s close out by{" "}
            {formatCountdown((values.anti_snipe_extension_seconds ?? 0) * 1000)}
            , up to {values.max_extensions ?? 0} times. Each lot keeps its own
            extension count.
          </Note>
        </Panel>

        <Panel
          title="Increment rules"
          description="Optional. Added after the auction is created."
        >
          <IncrementRulesEditor
            bands={bands}
            currency={values.currency_code || "ZAR"}
            usingGlobalFallback={bands.length === 0}
            onAdd={({ minPriceMinor, incrementMinor }) =>
              setBands((prev) => [...prev, { minPriceMinor, incrementMinor }])
            }
            onDelete={(band) =>
              setBands((prev) =>
                prev.filter((b) => b.minPriceMinor !== band.minPriceMinor),
              )
            }
          />
        </Panel>

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting || mutation.isPending}
          >
            Create draft auction
          </Button>
          <Button variant="ghost" onClick={() => router.push("/auctions")}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
