// Manual ML Performance Pipeline Trigger for September 5th
async function triggerMLPipeline() {
  console.log('🚀 Starting manual ML performance pipeline for September 5th...');
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  
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

console.log(`
Usage:
  SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node manual-ml-trigger.js

This script will:
- Trigger populate-ml-performance-data for all recent races
- Trigger update-ml-model-performance to update aggregated stats
`);

triggerMLPipeline();
