import { test, expect } from "@playwright/test";
// Exercise demo UX without making live provider calls even when local credentials exist.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, aiAvailable: false } });
  });
});
test("English home, renewal checklist, source, chat, download and clear", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Any notice/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try a sample notice", exact: true }),
  ).toBeEnabled();
  expect(await page.locator("html").getAttribute("lang")).toBe("en");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `artifacts/home-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /A payment, with clear next steps/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Community centre membership renewal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "5 November 2026", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /YOUR TO-DO LIST/ }).click();
  const check = page.getByRole("checkbox").first();
  await check.check();
  await expect(check).toBeChecked();
  await expect(
    page.getByText("1 of 3 completed", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    sessionStorage.getItem("ponte-checklist"),
  );
  expect(stored).not.toContain("To current Riverside");
  const source = page
    .getByRole("button", { name: "View source", exact: true })
    .first();
  await source.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText(/Exact quote found/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(source).toBeFocused();
  await page
    .getByRole("button", { name: "View document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original document" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "What is the payment deadline?" })
    .click();
  await expect(page.locator(".chat-message")).toContainText("9 November 2026");
  await page
    .getByRole("textbox", { name: "Question about the notice" })
    .fill("Will a doctor be there?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".chat-message").last()).toContainText(
    "The document does not specify this",
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download summary" }).click();
  expect((await downloading).suggestedFilename()).toBe("ponte-summary.txt");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `artifacts/results-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Clear document & start again" })
    .click();
  await expect(page.getByRole("heading", { name: /Any notice/ })).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("ponte-checklist")),
  ).toBeNull();
  expect(errors).toEqual([]);
});
test("English missing-details and meeting examples, optional profile and text input", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /When details are missing/ }).click();
  await expect(
    page.getByRole("heading", { name: "Community robotics workshop" }),
  ).toBeVisible();
  await expect(
    page.getByText("Attachment A is missing", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The deadline cannot be determined", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/unclear-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Clear document & start again" })
    .click();
  await page.locator(".personalize summary").click();
  await page
    .getByRole("combobox", { name: "Reading for" })
    .selectOption("myself");
  await page
    .getByRole("textbox", { name: "Recipient or group" })
    .fill("Riverside");
  await page
    .getByRole("button", { name: /A payment, with clear next steps/ })
    .click();
  await expect(page.locator(".class-note")).toContainText(
    "An explicit match was found",
  );
  await page
    .getByRole("button", { name: "Clear document & start again" })
    .click();
  await page
    .getByRole("button", { name: /An appointment, made simple/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Community advice appointments" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Do I need to sign anything?" })
    .click();
  await expect(page.locator(".chat-message")).toContainText(
    "The document does not specify this",
  );
  await page
    .getByRole("button", { name: "Clear document & start again" })
    .click();
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page
    .getByRole("textbox", { name: "Document text" })
    .fill("A new notice, not a prepared example.");
  await expect(
    page.getByText(
      "Your document is ready. Analysis is temporarily unavailable. Please try again later.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try a sample notice", exact: true }),
  ).toBeEnabled();
});
test("English upload errors and keyboard tab navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Upload PDF" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Paste text" })).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Document text" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Upload PDF" })).toBeFocused();
  await page.locator("input[type=file]").setInputFiles({
    name: "notice.docx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("x"),
  });
  await expect(page.getByRole("alert")).toContainText("Unsupported format");
});
test("Presentation interface hides setup details and clearly labels example content", async ({
  page,
}, info) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, aiAvailable: true } });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Explain this notice", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /prototype|demo mode|API key|apodex\//i,
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
  await page.screenshot({
    path: `artifacts/presentation-home-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /A payment, with clear next steps/ })
    .click();
  await expect(page.locator(".mode-badge")).toHaveText("EXAMPLE GUIDE");
  await expect(page.locator(".demo-banner")).toContainText(
    "prepared explanations and answers",
  );
  await expect(page.locator("body")).not.toContainText(
    /prototype|DEMO|demonstration only/i,
  );
});

test("Incomplete analysis warning is visible, exported and links to the original", async ({
  page,
}, info) => {
  await page.route("**/api/demo", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.analysis.warnings = [
      "This analysis is incomplete. 1 actions item could not be checked against the source and was left out. Review the original document.",
    ];
    data.analysis.actions = [];
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /A payment, with clear next steps/ })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "This analysis is incomplete",
  );
  await expect(
    page.getByText("Check the original for actions", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No verified actions were extracted.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View original document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original document", exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download summary" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain("INCOMPLETE ANALYSIS");
  await page.screenshot({
    path: `artifacts/incomplete-analysis-${info.project.name}.png`,
    fullPage: true,
  });
});

test("Production CSP allows the interface and locally served fonts without external requests", async ({
  page,
}) => {
  const external: string[] = [];
  const violations: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      external.push(url.origin);
      await route.abort();
      return;
    }
    await route.fallback();
  });
  page.on("console", (message) => {
    if (/content security policy|violates.*directive/i.test(message.text()))
      violations.push(message.text());
  });
  const response = await page.goto("/");
  expect(await response!.headerValue("content-security-policy")).toContain(
    "font-src 'self'",
  );
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check("800 32px Manrope")),
  ).toBe(true);
  await page
    .getByRole("button", { name: /A payment, with clear next steps/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Community centre membership renewal" }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(violations).toEqual([]);
});

test("A real text PDF uploads and extracts through the production worker", async ({
  page,
}) => {
  await page.goto("/");
  const extraction = page.waitForResponse((response) =>
    response.url().endsWith("/api/extract"),
  );
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/notice.pdf");
  const response = await extraction;
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.pages[0].text).toContain("5 November 2026");
  await expect(
    page.getByText("1 page read successfully", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
