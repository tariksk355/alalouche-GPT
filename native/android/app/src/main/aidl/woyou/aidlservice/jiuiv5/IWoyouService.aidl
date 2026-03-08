package woyou.aidlservice.jiuiv5;

import woyou.aidlservice.jiuiv5.ICallback;
import Bitmap;

interface IWoyouService {
    void printerInit(ICallback callback);
    void lineWrap(int n, ICallback callback);
    void sendRAWData(in byte[] data, ICallback callback);
    void setAlignment(int alignment, ICallback callback);
    void setFontSize(float fontsize, ICallback callback);
    void printText(String text, ICallback callback);
    void printTextWithFont(String text, String typeface, float fontsize, ICallback callback);
    void printColumnsText(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, ICallback callback);
    void printBitmap(in Bitmap bitmap, ICallback callback);
    void printBarCode(String data, int symbology, int height, int width, int textposition, ICallback callback);
    void printQRCode(String data, int modulesize, int errorlevel, ICallback callback);
    void enterPrinterBuffer(boolean clean);
    void commitPrinterBuffer();
    void exitPrinterBuffer(boolean commit);
    String getServiceVersion();
    String getPrinterSerialNo();
    String getPrinterVersion();
    int getPrintedLength();
    int updatePrinterState();
    void cutPaper(ICallback callback);
    void openDrawer(ICallback callback);
}
