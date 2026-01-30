/**
 * Layout Verification Script
 * Run this in the browser console to check if the menu fits.
 */

function verifyLayout() {
    const menuContent = document.querySelector('.menu-content');
    const viewportHeight = window.innerHeight;
    const contentHeight = menuContent.getBoundingClientRect().height;

    console.log(`Viewport Height: ${viewportHeight}px`);
    console.log(`Content Height: ${contentHeight}px`);

    if (contentHeight > viewportHeight) {
        console.error('❌ FAIL: Content exceeds viewport height by ' + (contentHeight - viewportHeight) + 'px');
        console.warn('Suggestion: Reduce logo size further or remove utility buttons labels.');
    } else {
        console.log('✅ PASS: Content fits within viewport. Clearance: ' + (viewportHeight - contentHeight) + 'px');
    }

    const utilBtns = document.querySelector('.menu-utilities');
    const bottomRect = utilBtns.getBoundingClientRect().bottom;

    if (bottomRect > viewportHeight) {
        console.error('❌ FAIL: Utility buttons are cut off.');
    }
}

verifyLayout();
