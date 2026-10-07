package com.savvypiggy.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Rect;
import android.net.Uri;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import java.io.File;

/**
 * Quick entry from a picture or from another app.
 *
 * Everything here stays on the phone: the picture is read by ML Kit's bundled
 * recognizer (no network, nothing uploaded) and a photo taken for the purpose
 * is deleted as soon as it has been read. The page gets back only the lines of
 * text and where they sat; it decides what they mean.
 */
@CapacitorPlugin(name = "QuickRead")
public class QuickReadPlugin extends Plugin {
    /** What another app shared with us and the page has not taken yet. */
    private JSObject pending = null;
    private File cameraFile = null;
    private TextRecognizer recognizer = null;

    @Override
    public void load() {
        handleShare(getActivity().getIntent());
    }

    /** Remembers an image or some text shared to the app. Returns whether there was one. */
    @SuppressWarnings("deprecation")
    boolean handleShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        String type = intent.getType();
        JSObject shared = new JSObject();
        if (type != null && type.startsWith("image/")) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri == null) return false;
            shared.put("kind", "image");
            shared.put("uri", uri.toString());
        } else if (type != null && type.startsWith("text/")) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null || text.trim().isEmpty()) return false;
            shared.put("kind", "text");
            shared.put("text", text);
        } else {
            return false;
        }
        // Taken: opening the app again from the recents list must not replay it.
        intent.setAction(Intent.ACTION_MAIN);
        pending = shared;
        return true;
    }

    /** A share that arrived while the app was already running. */
    void announceShare(Intent intent) {
        if (handleShare(intent) && pending != null) notifyListeners("shared", pending, true);
    }

    @PluginMethod
    public void getShared(PluginCall call) {
        if (pending == null) {
            JSObject none = new JSObject();
            none.put("kind", "none");
            call.resolve(none);
        } else {
            call.resolve(pending);
        }
    }

    @PluginMethod
    public void clearShared(PluginCall call) {
        pending = null;
        call.resolve();
    }

    /** Opens the camera or the photo picker. Resolves with the picture's address, or `cancelled`. */
    @PluginMethod
    public void pick(PluginCall call) {
        String source = call.getString("source", "gallery");
        Intent intent;
        if ("camera".equals(source)) {
            try {
                cameraFile = File.createTempFile("capture", ".jpg", getContext().getCacheDir());
            } catch (Exception e) {
                call.reject("camera");
                return;
            }
            Uri out = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", cameraFile);
            intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, out);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            cameraFile = null;
            intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("image/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
        }
        try {
            startActivityForResult(call, intent, "pickResult");
        } catch (Exception e) {
            discardCameraFile();
            call.reject("unavailable");
        }
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject out = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK) {
            discardCameraFile();
            out.put("cancelled", true);
            call.resolve(out);
            return;
        }
        if (cameraFile != null) {
            out.put("uri", Uri.fromFile(cameraFile).toString());
        } else if (result.getData() != null && result.getData().getData() != null) {
            out.put("uri", result.getData().getData().toString());
        } else {
            call.reject("nothing");
            return;
        }
        call.resolve(out);
    }

    /** Reads the text in a picture. The photo taken by `pick` is deleted once it has been read. */
    @PluginMethod
    public void recognize(PluginCall call) {
        String address = call.getString("uri");
        if (address == null) {
            call.reject("uri");
            return;
        }
        InputImage image;
        try {
            image = InputImage.fromFilePath(getContext(), Uri.parse(address));
        } catch (Exception e) {
            discardCameraFile();
            call.reject("unreadable");
            return;
        }
        if (recognizer == null) {
            recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        }
        recognizer
            .process(image)
            .addOnSuccessListener(text -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock block : text.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        Rect box = line.getBoundingBox();
                        if (box == null) continue;
                        JSObject one = new JSObject();
                        one.put("text", line.getText());
                        one.put("top", box.top);
                        one.put("left", box.left);
                        one.put("height", box.height());
                        lines.put(one);
                    }
                }
                discardCameraFile();
                JSObject out = new JSObject();
                out.put("lines", lines);
                call.resolve(out);
            })
            .addOnFailureListener(e -> {
                discardCameraFile();
                call.reject("failed");
            });
    }

    private void discardCameraFile() {
        if (cameraFile != null) {
            //noinspection ResultOfMethodCallIgnored
            cameraFile.delete();
            cameraFile = null;
        }
    }
}
