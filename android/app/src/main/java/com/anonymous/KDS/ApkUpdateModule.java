package com.anonymous.KDS;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.File;

public class ApkUpdateModule extends ReactContextBaseJavaModule {
  private static final String TAG = "ApkUpdateModule";
  private static final String APK_FILE_NAME = "kds-update.apk";

  private BroadcastReceiver downloadReceiver;
  private long currentDownloadId = -1L;

  public ApkUpdateModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "ApkUpdateModule";
  }

  @ReactMethod
  public void downloadAndInstallApk(String apkUrl, Promise promise) {
    if (apkUrl == null || apkUrl.isEmpty()) {
      promise.reject("INVALID_URL", "APK url is empty");
      return;
    }

    ReactApplicationContext context = getReactApplicationContext();
    DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
    if (downloadManager == null) {
      promise.reject("DOWNLOAD_MANAGER_UNAVAILABLE", "DownloadManager is unavailable");
      return;
    }

    try {
      unregisterDownloadReceiverIfNeeded();

      File downloadsDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      if (downloadsDir == null) {
        promise.reject("DOWNLOAD_DIR_UNAVAILABLE", "Download directory is unavailable");
        return;
      }

      File apkFile = new File(downloadsDir, APK_FILE_NAME);
      if (apkFile.exists() && !apkFile.delete()) {
        Log.w(TAG, "Failed to delete existing APK file");
      }

      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
      request.setTitle("KDS Update");
      request.setDescription("Downloading app-release.apk");
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      request.setAllowedOverMetered(true);
      request.setAllowedOverRoaming(true);
      request.setDestinationUri(Uri.fromFile(apkFile));

      currentDownloadId = downloadManager.enqueue(request);
      registerDownloadReceiver(context, downloadManager, apkFile);

      WritableMap result = Arguments.createMap();
      result.putDouble("downloadId", currentDownloadId);
      promise.resolve(result);
    } catch (Exception e) {
      promise.reject("DOWNLOAD_START_FAILED", e);
    }
  }

  private void registerDownloadReceiver(ReactApplicationContext context, DownloadManager downloadManager, File apkFile) {
    downloadReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context receiverContext, Intent intent) {
        if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
          return;
        }

        long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
        if (downloadId != currentDownloadId) {
          return;
        }

        boolean success = isDownloadSuccessful(downloadManager, downloadId);
        if (success) {
          promptInstallApk(context, apkFile);
        } else {
          Log.e(TAG, "APK download failed for id: " + downloadId);
        }

        unregisterDownloadReceiverIfNeeded();
      }
    };

    IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    } else {
      context.registerReceiver(downloadReceiver, filter);
    }
  }

  private boolean isDownloadSuccessful(DownloadManager downloadManager, long downloadId) {
    DownloadManager.Query query = new DownloadManager.Query();
    query.setFilterById(downloadId);

    Cursor cursor = null;
    try {
      cursor = downloadManager.query(query);
      if (cursor != null && cursor.moveToFirst()) {
        int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
        int status = cursor.getInt(statusIndex);
        return status == DownloadManager.STATUS_SUCCESSFUL;
      }
    } catch (Exception e) {
      Log.e(TAG, "Failed querying download status", e);
    } finally {
      if (cursor != null) {
        cursor.close();
      }
    }
    return false;
  }

  private void promptInstallApk(ReactApplicationContext context, File apkFile) {
    try {
      if (!apkFile.exists()) {
        Log.e(TAG, "APK file does not exist: " + apkFile.getAbsolutePath());
        return;
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
        Intent permissionIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        permissionIntent.setData(Uri.parse("package:" + context.getPackageName()));
        permissionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(permissionIntent);
        Log.w(TAG, "Install unknown apps permission required");
        return;
      }

      Uri apkUri = FileProvider.getUriForFile(
        context,
        context.getPackageName() + ".fileprovider",
        apkFile
      );

      Intent installIntent = new Intent(Intent.ACTION_VIEW);
      installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
      installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      context.startActivity(installIntent);
    } catch (Exception e) {
      Log.e(TAG, "Failed to prompt APK install", e);
    }
  }

  private void unregisterDownloadReceiverIfNeeded() {
    ReactApplicationContext context = getReactApplicationContext();
    if (downloadReceiver != null) {
      try {
        context.unregisterReceiver(downloadReceiver);
      } catch (Exception e) {
        Log.w(TAG, "Receiver already unregistered", e);
      } finally {
        downloadReceiver = null;
      }
    }
  }

  @Override
  public void invalidate() {
    super.invalidate();
    unregisterDownloadReceiverIfNeeded();
  }
}