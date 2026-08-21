package com.waslati.offline;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** يفتح منتقي النظام لحفظ نسخة وصلاتي في الموقع والاسم اللذين يختارهما المستخدم. */
@CapacitorPlugin(name = "BackupSaver")
public class BackupSaverPlugin extends Plugin {
  @PluginMethod
  public void saveBackup(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/json");
    intent.putExtra(Intent.EXTRA_TITLE, call.getString("fileName", "waslati-backup.json"));
    startActivityForResult(call, intent, "saveBackupResult");
  }

  @ActivityCallback
  private void saveBackupResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
      call.reject("أُلغي اختيار مكان حفظ النسخة الاحتياطية.");
      return;
    }
    Uri location = result.getData().getData();
    String content = call.getString("content", "");
    try (OutputStream stream = getContext().getContentResolver().openOutputStream(location, "w")) {
      if (stream == null) throw new IllegalStateException("تعذر فتح ملف الحفظ.");
      stream.write(content.getBytes(StandardCharsets.UTF_8));
      stream.flush();
      call.resolve();
    } catch (Exception error) {
      call.reject("تعذر حفظ النسخة الاحتياطية في الموقع المحدد.", error);
    }
  }
}
