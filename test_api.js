import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:8000/api';

async function testAPIs() {
  try {
    console.log("🔑 Logging in as System Owner (system@test.com)...");
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'system@test.com',
      password: '123456'
    });

    const accessToken = loginRes.data.data.accessToken;
    console.log("✅ Logged in successfully!");

    const authHeader = {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    };

    console.log("\n=============================================");
    console.log("📊 1. Testing GET /api/system-owner/dashboard/usage-minutes (Default: Current Month)");
    console.log("=============================================");
    const defaultUsageRes = await axios.get(`${BASE_URL}/system-owner/dashboard/usage-minutes`, authHeader);
    console.log("Response Status:", defaultUsageRes.status);
    console.log("Timestamp in Response:", defaultUsageRes.data.timestamp);
    console.log("Usage Minutes (Default current month) output:");
    console.log(JSON.stringify(defaultUsageRes.data.data, null, 2));

    console.log("\n=============================================");
    console.log("📊 2. Testing GET /api/system-owner/dashboard/usage-minutes?month=2026-05 (May 2026)");
    console.log("=============================================");
    const mayUsageRes = await axios.get(`${BASE_URL}/system-owner/dashboard/usage-minutes?month=2026-05`, authHeader);
    console.log("Usage Minutes (May 2026) output:");
    console.log(JSON.stringify(mayUsageRes.data.data, null, 2));

    console.log("\n=============================================");
    console.log("🛰️ 3. Testing GET /api/system-owner/dashboard/ (Overview - Timestamp removed)");
    console.log("=============================================");
    const overviewRes = await axios.get(`${BASE_URL}/system-owner/dashboard/`, authHeader);
    console.log("Overview Response Status:", overviewRes.status);
    console.log("Timestamp in Response (should be undefined):", overviewRes.data.timestamp);
    console.log("Overview Data Keys:", Object.keys(overviewRes.data.data));

  } catch (error) {
    if (error.response) {
      console.error("❌ Request failed with status:", error.response.status);
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("❌ Error during requests:", error.message);
    }
  }
}

testAPIs();
