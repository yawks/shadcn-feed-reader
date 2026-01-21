package net.yawks.feedreader.plugin.clipboard;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "Clipboard")
public class ClipboardPlugin extends Plugin {

    private static final String TAG = "ClipboardPlugin";

    @PluginMethod
    public void copyImage(PluginCall call) {
        String imagePath = call.getString("imagePath");
        if (imagePath == null || imagePath.isEmpty()) {
            call.reject("Missing imagePath");
            return;
        }

        try {
            Context context = getContext();
            ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            
            if (clipboard == null) {
                call.reject("Clipboard service not available");
                return;
            }

            // Convertir l'URI string en URI
            Uri imageUri = Uri.parse(imagePath);
            
            // Déterminer le MIME type depuis le nom du fichier
            String mimeType = "image/jpeg"; // Par défaut
            String filePath = imageUri.getPath();
            if (filePath != null) {
                String lowerPath = filePath.toLowerCase();
                if (lowerPath.endsWith(".png")) {
                    mimeType = "image/png";
                } else if (lowerPath.endsWith(".gif")) {
                    mimeType = "image/gif";
                } else if (lowerPath.endsWith(".webp")) {
                    mimeType = "image/webp";
                }
            }
            
            // Si c'est un URI de fichier (file://), le convertir en URI de contenu via FileProvider
            if ("file".equals(imageUri.getScheme())) {
                try {
                    // Extraire le chemin du fichier depuis l'URI
                    if (filePath == null) {
                        call.reject("Invalid file path in URI");
                        return;
                    }
                    
                    File file = new File(filePath);
                    if (!file.exists()) {
                        call.reject("File does not exist: " + filePath);
                        return;
                    }
                    
                    // Utiliser FileProvider pour obtenir un URI de contenu
                    String authority = context.getPackageName() + ".fileprovider";
                    imageUri = FileProvider.getUriForFile(context, authority, file);
                    Log.d(TAG, "Converted file URI to content URI: " + imageUri);
                } catch (Exception e) {
                    Log.e(TAG, "Error converting file URI to content URI", e);
                    call.reject("Failed to convert file URI: " + e.getMessage(), e);
                    return;
                }
            }
            
            // Créer un ClipData avec l'URI de l'image et le MIME type approprié
            // ClipData.newUri gère automatiquement les permissions temporaires pour les apps qui accèdent au presse-papiers
            ClipData clip = ClipData.newUri(context.getContentResolver(), mimeType, imageUri);
            clipboard.setPrimaryClip(clip);
            
            Log.d(TAG, "Image copied to clipboard successfully: " + imageUri + " (MIME: " + mimeType + ")");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error copying image to clipboard", e);
            call.reject("Failed to copy image: " + e.getMessage(), e);
        }
    }
}

