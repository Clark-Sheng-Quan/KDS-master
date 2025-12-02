package com.anonymous.KDS

import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper
import com.anonymous.KDS.DeviceDiscovery.DiscoveryRegistry

class MainActivity : ReactActivity() {
  private var discoveryRegistry: DiscoveryRegistry? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
    
    // 设置沉浸式全屏模式，隐藏系统导航栏
    enableImmersiveMode()
    
    // 初始化设备发现服务
    initializeDeviceDiscovery()
  }
  
  /**
   * Full Screen
   */
  private fun enableImmersiveMode() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // Android 12 (API 31+) 
      window.insetsController?.let {
        it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
        it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    } else {
      // Android 11 (API 30) 
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      )
    }
  }
  
  /**
   * 在恢复应用时重新应用沉浸式模式
   */
  override fun onResume() {
    super.onResume()
    enableImmersiveMode()
  }

  /**
   * 在销毁应用时停止设备发现服务
   */
  override fun onDestroy() {
    super.onDestroy()
    if (discoveryRegistry != null) {
      try {
        discoveryRegistry!!.stopService()
        Log.d("MainActivity", "Device Discovery Service stopped on destroy")
      } catch (e: Exception) {
        Log.e("MainActivity", "Error stopping device discovery on destroy", e)
      }
      discoveryRegistry = null
    }
  }
  
  /**
   * 初始化设备发现服务
   * 在应用启动时启动 mDNS 广播，并清空旧的设备缓存
   */
  private fun initializeDeviceDiscovery() {
    try {
      // 停止之前的实例（如果存在）
      if (discoveryRegistry != null) {
        try {
          discoveryRegistry!!.stopService()
          Log.d("MainActivity", "Stopped previous device discovery service")
        } catch (e: Exception) {
          Log.e("MainActivity", "Error stopping previous service", e)
        }
        discoveryRegistry = null
      }

      // 清空旧的设备缓存，避免显示已改名的旧设备
      val prefs = getSharedPreferences("DevicePrefs", MODE_PRIVATE)
      prefs.edit().remove("SavedDeviceMap").apply()
      Log.d("MainActivity", "Cleared old device cache")
      
      // 创建新的 DiscoveryRegistry 实例（这会生成新的服务名）
      discoveryRegistry = DiscoveryRegistry(this)
      discoveryRegistry!!.StartService()
      Log.d("MainActivity", "Device Discovery Service started with new service name")
    } catch (e: Exception) {
      Log.e("MainActivity", "Error initializing device discovery", e)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
