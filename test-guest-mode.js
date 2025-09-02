// Test script to verify guest mode implementation
// Run this in the browser console to check the Redux state

// Check if Redux DevTools are available
if (window.__REDUX_DEVTOOLS_EXTENSION__) {
  const state = window.__REDUX_DEVTOOLS_EXTENSION__.getState();
  
  console.log('=== Guest Mode Test Results ===');
  console.log('User State:', state.user);
  console.log('Is Guest?', state.user.isGuest);
  console.log('User ID:', state.user.user_id);
  console.log('Auth ID:', state.user.auth_id);
  
  if (state.user.isGuest) {
    console.log('✅ Guest mode is active');
    
    // Check if guest ID is stored in localStorage
    const guestId = localStorage.getItem('guest_id');
    if (guestId) {
      console.log('✅ Guest ID stored in localStorage:', guestId);
    } else {
      console.log('⚠️ No guest ID in localStorage');
    }
  } else {
    console.log('✅ User is authenticated');
    console.log('User Email:', state.user.email);
    console.log('User Name:', state.user.first_name, state.user.last_name);
  }
} else {
  console.log('Redux DevTools not available. Check the console logs above for guest mode status.');
}