// Manual ML Performance Pipeline Trigger for September 5th
async function triggerMLPipeline() {
  console.log('🚀 Starting manual ML performance pipeline for September 5th...');
  
  const SUPABASE_URL = 'https://zjqojacejstbqmxzstyk.supabase.co';
  // You'll need to replace this with your actual service role key
  const SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE';
  
  try {
    // Step 1: Trigger populate-ml-performance-data
    console.log('📊 Step 1: Triggering ML performance data population...');
    const populateResponse = await fetch(`${SUPABASE_URL}/functions/v1/populate-ml-performance-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        triggered_by: 'manual_september_5th_fix'
      })
    });
    
    if (!populateResponse.ok) {
      const errorText = await populateResponse.text();
      throw new Error(`Populate ML data failed: ${populateResponse.status} - ${errorText}`);
    }
    
    const populateResult = await populateResponse.json();
    console.log('✅ ML performance data populated:', populateResult);
    
    // Step 2: Trigger update-ml-model-performance 
    console.log('📈 Step 2: Triggering ML model performance table update...');
    const updateResponse = await fetch(`${SUPABASE_URL}/functions/v1/update-ml-model-performance`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        triggered_by: 'manual_september_5th_fix'
      })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Update ML performance failed: ${updateResponse.status} - ${errorText}`);
    }
    
    const updateResult = await updateResponse.json();
    console.log('✅ ML model performance updated:', updateResult);
    
    console.log('🎉 Manual ML pipeline completed successfully!');
    
  } catch (error) {
    console.error('❌ Error in manual ML pipeline:', error.message);
    process.exit(1);
  }
}

// Show instructions
console.log(`
⚠️  SETUP REQUIRED:
1. Replace 'YOUR_SERVICE_ROLE_KEY_HERE' with your actual Supabase service role key
2. Run: node manual-ml-trigger.js

🔧 To get your service role key:
1. Go to Supabase Dashboard → Settings → API
2. Copy the 'service_role' secret key (not the anon public key)
3. Replace it in this script

📝 This script will:
- Trigger populate-ml-performance-data for all recent races
- Trigger update-ml-model-performance to update aggregated stats
`);

// Uncomment the line below after adding your service role key
// triggerMLPipeline();
