package com.komaread.library;

import android.app.Dialog;
import android.os.Bundle;
import android.os.Message;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String CHROME_UA =
        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            WebView mainWebView = this.getBridge().getWebView();
            if (mainWebView != null) {
                WebSettings settings = mainWebView.getSettings();
                settings.setUserAgentString(CHROME_UA);
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setSupportMultipleWindows(true);
                settings.setJavaScriptCanOpenWindowsAutomatically(true);

                mainWebView.setWebChromeClient(new WebChromeClient() {
                    private Dialog popupDialog = null;

                    @Override
                    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                        try {
                            popupDialog = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_Light_NoActionBar_Fullscreen);
                            WebView popupWebView = new WebView(MainActivity.this);
                            WebSettings popupSettings = popupWebView.getSettings();
                            popupSettings.setJavaScriptEnabled(true);
                            popupSettings.setDomStorageEnabled(true);
                            popupSettings.setSupportMultipleWindows(true);
                            popupSettings.setJavaScriptCanOpenWindowsAutomatically(true);
                            popupSettings.setUserAgentString(CHROME_UA);

                            popupWebView.setWebChromeClient(new WebChromeClient() {
                                @Override
                                public void onCloseWindow(WebView window) {
                                    if (popupDialog != null && popupDialog.isShowing()) {
                                        popupDialog.dismiss();
                                    }
                                    window.destroy();
                                }
                            });

                            popupWebView.setWebViewClient(new WebViewClient() {
                                @Override
                                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                                    return false;
                                }
                            });

                            popupDialog.setContentView(popupWebView, new ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            ));

                            popupDialog.setOnCancelListener(d -> {
                                try {
                                    popupWebView.destroy();
                                } catch (Exception ignored) {}
                            });

                            popupDialog.show();

                            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                            transport.setWebView(popupWebView);
                            resultMsg.sendToTarget();
                            return true;
                        } catch (Exception e) {
                            return false;
                        }
                    }

                    @Override
                    public void onCloseWindow(WebView window) {
                        if (popupDialog != null && popupDialog.isShowing()) {
                            popupDialog.dismiss();
                        }
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onBackPressed() {
        try {
            WebView mainWebView = this.getBridge().getWebView();
            if (mainWebView != null) {
                mainWebView.evaluateJavascript(
                    "(function() { try { if (window.__komyHandleBackAction && window.__komyHandleBackAction()) { return 'handled'; } } catch(e){} return 'unhandled'; })();",
                    value -> {
                        if (value == null || !value.contains("handled")) {
                            runOnUiThread(() -> MainActivity.super.onBackPressed());
                        }
                    }
                );
                return;
            }
        } catch (Exception ignored) {}
        super.onBackPressed();
    }
}
