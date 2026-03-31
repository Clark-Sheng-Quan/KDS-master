package com.anonymous.KDS;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

public class BootPermissionModule extends ReactContextBaseJavaModule {
  private static final String BOOT_DIAG_PREFS = "kds_boot_diagnostics";
  private static final String TAG = "BootPermissionModule";

  public BootPermissionModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "BootPermissionModule";
  }

  @ReactMethod
  public void checkBootAutoStartStatus(Promise promise) {
    try {
      ReactApplicationContext context = getReactApplicationContext();
      String packageName = context.getPackageName();

      WritableMap result = Arguments.createMap();
      result.putString("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
      result.putString("brand", Build.BRAND == null ? "" : Build.BRAND);
      result.putInt("sdkInt", Build.VERSION.SDK_INT);

      boolean hasBootPermissionDeclared = false;
      PackageManager pm = context.getPackageManager();
      PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS);
      if (packageInfo.requestedPermissions != null) {
        for (String permission : packageInfo.requestedPermissions) {
          if ("android.permission.RECEIVE_BOOT_COMPLETED".equals(permission)) {
            hasBootPermissionDeclared = true;
            break;
          }
        }
      }
      result.putBoolean("hasBootPermissionDeclared", hasBootPermissionDeclared);

      boolean isIgnoringBatteryOptimizations = true;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PowerManager powerManager = (PowerManager) context.getSystemService(ReactApplicationContext.POWER_SERVICE);
        if (powerManager != null) {
          isIgnoringBatteryOptimizations = powerManager.isIgnoringBatteryOptimizations(packageName);
        }
      }
      result.putBoolean("isIgnoringBatteryOptimizations", isIgnoringBatteryOptimizations);

      SharedPreferences diagPrefs = context.getSharedPreferences(BOOT_DIAG_PREFS, ReactApplicationContext.MODE_PRIVATE);
      result.putString("lastBootAction", diagPrefs.getString("lastBootAction", ""));
      result.putDouble("lastBootReceivedAt", (double) diagPrefs.getLong("lastBootReceivedAt", 0));
      result.putBoolean("lastBootLaunchAttempted", diagPrefs.getBoolean("lastBootLaunchAttempted", false));
      result.putBoolean("lastBootLaunchSucceeded", diagPrefs.getBoolean("lastBootLaunchSucceeded", false));
      result.putString("lastBootLaunchError", diagPrefs.getString("lastBootLaunchError", ""));

      // Android 没有统一公开 API 能直接判断"自启动开关"是否打开
      result.putBoolean("autoStartPermissionCheckSupported", false);

      promise.resolve(result);
    } catch (Exception e) {
      promise.reject("CHECK_BOOT_STATUS_ERROR", e);
    }
  }

  @ReactMethod
  public void openAutoStartSettings(Promise promise) {
    try {
      ReactApplicationContext context = getReactApplicationContext();
      String packageName = context.getPackageName();

      // 常见 ROM 自启动管理页面，按顺序尝试
      Intent[] intents = new Intent[] {
        // Xiaomi/Redmi
        new Intent().setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        new Intent().setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity").putExtra("extra_pkgname", packageName),
        // OPPO/realme/OnePlus (部分版本)
        new Intent().setClassName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
        new Intent().setClassName("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"),
        new Intent().setClassName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
        // vivo/iQOO
        new Intent().setClassName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
        new Intent().setClassName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
        new Intent().setClassName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity"),
        // Huawei/Honor
        new Intent().setClassName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        new Intent().setClassName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
        // Meizu
        new Intent().setClassName("com.meizu.safe", "com.meizu.safe.permission.SmartBGActivity"),
        // Transsion/Infinix/Tecno
        new Intent().setClassName("com.transsion.phonemaster", "com.itel.autobootmanager.activity.AutoBootMgrActivity"),
        // Android 12+ App battery page (AOSP/部分 RK 固件)
        new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
          .setData(Uri.parse("package:" + packageName)),
        // App specific battery optimization request
        new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
          .setData(Uri.parse("package:" + packageName)),
        // Samsung (应用详情兜底前的尝试)
        new Intent().setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
          .setData(Uri.parse("package:" + packageName))
      };

      boolean launched = false;
      Exception lastError = null;
      for (Intent intent : intents) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
          if (intent.resolveActivity(context.getPackageManager()) != null) {
            context.startActivity(intent);
            launched = true;
            break;
          }
        } catch (Exception e) {
          lastError = e;
          Log.w(TAG, "Auto-start intent failed: " + intent, e);
        }
      }

      if (!launched) {
        Intent[] fallbackIntents = new Intent[] {
          new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:" + packageName)),
          new Intent(Settings.ACTION_SETTINGS)
        };

        for (Intent fallbackIntent : fallbackIntents) {
          fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
          try {
            if (fallbackIntent.resolveActivity(context.getPackageManager()) != null) {
              context.startActivity(fallbackIntent);
              launched = true;
              break;
            }
          } catch (Exception e) {
            lastError = e;
            Log.w(TAG, "Auto-start fallback failed: " + fallbackIntent, e);
          }
        }
      }

      if (!launched) {
        if (lastError != null) {
          promise.reject("OPEN_AUTOSTART_SETTINGS_ERROR", lastError);
        } else {
          promise.reject("OPEN_AUTOSTART_SETTINGS_ERROR", "No matching settings activity found");
        }
        return;
      }

      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("OPEN_AUTOSTART_SETTINGS_ERROR", e);
    }
  }

  @ReactMethod
  public void openBatteryOptimizationSettings(Promise promise) {
    try {
      ReactApplicationContext context = getReactApplicationContext();
      Intent intent;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      } else {
        intent = new Intent(Settings.ACTION_SETTINGS);
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("OPEN_BATTERY_SETTINGS_ERROR", e);
    }
  }
}
