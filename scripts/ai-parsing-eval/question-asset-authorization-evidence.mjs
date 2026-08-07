import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const syntheticAssetId = "00000000-0000-4000-8000-000000000001";

async function loadQuestionAssetRoute(runtime) {
  const filePath = resolve(root, "src/app/api/question-assets/[assetId]/route.ts");
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const requireMock = (specifier) => {
    if (specifier === "next/server") {
      return {
        NextResponse: {
          json(body, init) {
            return new Response(JSON.stringify(body), {
              ...init,
              headers: {
                "content-type": "application/json",
                ...(init?.headers ?? {}),
              },
            });
          },
          redirect(url, init) {
            return new Response(null, {
              ...init,
              headers: { location: url, ...(init?.headers ?? {}) },
            });
          },
        },
      };
    }
    if (specifier === "@/lib/supabase/server") {
      return {
        createClient: async () => ({
          rpc: async (name) => {
            assert.equal(name, "can_read_question_asset");
            runtime.rpcCalls += 1;
            return { data: runtime.rpcCanRead, error: null };
          },
        }),
        createServiceRoleClient: () => {
          runtime.serviceClientCreations += 1;
          const query = {
            select() {
              return query;
            },
            eq() {
              return query;
            },
            async maybeSingle() {
              runtime.metadataReads += 1;
              return {
                data: {
                  id: syntheticAssetId,
                  storage_bucket: "question-assets",
                  storage_path: "synthetic/evidence.png",
                },
                error: null,
              };
            },
          };
          return {
            from() {
              return query;
            },
            storage: {
              from() {
                return {
                  async createSignedUrl() {
                    runtime.signedUrlCalls += 1;
                    return {
                      data: { signedUrl: "https://example.invalid/signed" },
                      error: null,
                    };
                  },
                };
              },
            },
          };
        },
      };
    }
    throw new Error(`Unexpected route dependency: ${specifier}`);
  };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    requireMock,
    loadedModule,
    filePath,
    dirname(filePath),
  );
  return loadedModule.exports;
}

export async function buildQuestionAssetAuthorizationEvidence(scenarios) {
  const runtime = {
    metadataReads: 0,
    rpcCalls: 0,
    rpcCanRead: false,
    serviceClientCreations: 0,
    signedUrlCalls: 0,
  };
  const { GET } = await loadQuestionAssetRoute(runtime);
  const results = [];

  for (const scenario of scenarios) {
    runtime.rpcCanRead = scenario.rpcCanRead === true;
    const before = { ...runtime };
    const response = await GET(
      new Request("https://example.invalid/api/question-assets/synthetic"),
      { params: Promise.resolve({ assetId: syntheticAssetId }) },
    );
    const allowed = response.status === 302;
    const metadataReads = runtime.metadataReads - before.metadataReads;
    const signedUrlCalls = runtime.signedUrlCalls - before.signedUrlCalls;

    assert.equal(runtime.rpcCalls - before.rpcCalls, 1);
    assert.equal(allowed, scenario.expectedAllowed, `${scenario.caseId}: route result`);
    if (!allowed) {
      assert.equal(response.status, 404, `${scenario.caseId}: generic denial status`);
      assert.equal(metadataReads, 0, `${scenario.caseId}: service metadata must remain unread`);
      assert.equal(signedUrlCalls, 0, `${scenario.caseId}: signed URL must not be created`);
    }

    results.push({
      allowed,
      authorizationEvidence: "question_asset_route_runtime_negative",
      caseId: scenario.caseId,
      ownerOrganization: scenario.ownerOrganization,
      requesterOrganization: scenario.requesterOrganization,
      serviceMetadataRead: metadataReads > 0,
      signedUrlCreated: signedUrlCalls > 0,
    });
  }

  return results;
}
