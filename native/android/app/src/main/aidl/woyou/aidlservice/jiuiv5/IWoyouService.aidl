package woyou.aidlservice.jiuiv5;

import android.graphics.Bitmap;
import woyou.aidlservice.jiuiv5.ICallback;

/**
 * Sunmi internal printer AIDL contract.
 *
 * NOTE:
 * Binder transaction IDs are positional. Keep method order/signatures
 * aligned with the real Sunmi IWoyouService contract used by device firmware.
 */
interface IWoyouService {
    // Basic info
    String getServiceVersion();
    String getPrinterSerialNo();
    String getPrinterVersion();

    // Core printer ops
    void printerInit(ICallback callback);
    void printerSelfChecking(ICallback callback);
    int updatePrinterState();

    // Text/layout
    void lineWrap(int n, ICallback callback);
    void setAlignment(int alignment, ICallback callback);
    void setFontName(String typeface, ICallback callback);
    void setFontSize(float fontsize, ICallback callback);
    void printText(String text, ICallback callback);
    void printOriginalText(String text, ICallback callback);
    void printTextWithFont(String text, String typeface, float fontsize, ICallback callback);
    void printColumnsText(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, ICallback callback);
    void printColumnsString(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, ICallback callback);

    // Graphics/codes
    void printBitmap(in Bitmap bitmap, ICallback callback);
    void printBarCode(String data, int symbology, int height, int width, int textposition, ICallback callback);
    void printQRCode(String data, int modulesize, int errorlevel, ICallback callback);
    void print2DCode(String data, int symbology, int modulesize, int errorlevel, ICallback callback);

    // Raw mode / style
    void sendRAWData(in byte[] data, ICallback callback);
    void setPrinterStyle(int key, int value, ICallback callback);

    // Buffer mode
    void enterPrinterBuffer(boolean clean);
    void commitPrinterBuffer();
    void exitPrinterBuffer(boolean commit);
    void commitPrinterBufferWithCallback(ICallback callback);
    void exitPrinterBufferWithCallback(boolean commit, ICallback callback);
    void clearBuffer();

    // Fiscal/cash drawer
    void tax(in byte[] data, ICallback callback);
    void openDrawer(ICallback callback);
}
