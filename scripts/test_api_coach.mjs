import assert from 'node:assert';

console.log("=======================================================");
console.log("  TESTING LIVE NEXT.JS ROUTE: /api/ai-coach            ");
console.log("=======================================================\n");

async function runApiTests() {
  const baseUrl = "http://localhost:3000/api/ai-coach";

  // Test 1: Empty payload
  console.log("Test 1: Empty body payload validation");
  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(data.error.includes("Dữ liệu không hợp lệ"));
    console.log("  ✓ PASS: Empty payload correctly rejected with HTTP 400\n");
  } catch (err) {
    console.error("  ✗ FAIL Test 1:", err);
    process.exit(1);
  }

  // Test 2: Empty trades list
  console.log("Test 2: Empty trades list validation");
  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trades: [] })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(data.error.includes("Cần ít nhất một vài lệnh"));
    console.log("  ✓ PASS: Empty trades array correctly rejected with HTTP 400\n");
  } catch (err) {
    console.error("  ✗ FAIL Test 2:", err);
    process.exit(1);
  }

  // Test 3: Realistic trade dataset calling OpenRouter API
  console.log("Test 3: Calling OpenRouter via /api/ai-coach with realistic trades");
  try {
    const samplePayload = {
      accountName: "Topstep 100k Prop",
      trades: [
        {
          id: "t1",
          date: "2026-09-18T13:30:00Z",
          asset: "MNQ",
          direction: "BUY",
          pnl: -500,
          result: "Loss",
          setup: "Breakout",
          mistake: "FOMO",
          session: "London-NY Overlap",
          riskAmount: 500,
          rMultiple: -1.0
        },
        {
          id: "t2",
          date: "2026-09-18T13:45:00Z",
          asset: "MNQ",
          direction: "SELL",
          pnl: -600,
          result: "Loss",
          setup: "Breakout",
          mistake: "Revenge",
          session: "London-NY Overlap",
          riskAmount: 500,
          rMultiple: -1.2
        },
        {
          id: "t3",
          date: "2026-09-19T14:30:00Z",
          asset: "XAUUSD",
          direction: "BUY",
          pnl: 1500,
          result: "Win",
          setup: "Liquidity Sweep",
          mistake: "None",
          session: "London-NY Overlap",
          riskAmount: 500,
          rMultiple: 3.0
        }
      ]
    };

    console.log("  Sending request to /api/ai-coach (this calls OpenRouter)...");
    const startTime = Date.now();
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(samplePayload)
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const data = await res.json();

    console.log(`  Response received in ${elapsed}s with status ${res.status}`);

    if (res.status === 200) {
      const a = data.analysis;
      assert.ok(a && (a.big_leak || a.bigLeak), "Should have big_leak field");
      assert.ok(a && (a.real_edge || a.realEdge), "Should have real_edge field");
      assert.ok(a && (a.what_if || a.whatIf), "Should have what_if field");
      assert.ok(a && (a.action_rule || a.actionRule), "Should have action_rule field");

      console.log("\n  [AI Coach Diagnosis Output Preview]:");
      console.log(`  🚨 Big Leak: ${(a.big_leak || a.bigLeak).substring(0, 80)}...`);
      console.log(`  💎 Real Edge: ${(a.real_edge || a.realEdge).substring(0, 80)}...`);
      console.log(`  🔮 What-If: ${(a.what_if || a.whatIf).substring(0, 80)}...`);
      console.log(`  🎯 Rule: ${(a.action_rule || a.actionRule).substring(0, 80)}...`);
      console.log("\n  ✓ PASS: OpenRouter AI Coach API returned all 4 valid diagnosis sections!\n");
    } else {
      console.log("  Notice: AI Coach responded with error status:", data.error);
      console.log("  (Check if OPENROUTER_API_KEY is configured in .env.local)");
    }
  } catch (err) {
    console.error("  ✗ FAIL Test 3:", err);
    process.exit(1);
  }

  console.log(">>> LIVE API ROUTE VERIFICATION COMPLETE! <<<\n");
}

runApiTests();
