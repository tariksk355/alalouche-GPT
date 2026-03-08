package woyou.aidlservice.jiuiv5;

import woyou.aidlservice.jiuiv5.ICallback;

interface IWoyouService {
    String getServiceVersion();
    String getPrinterSerialNo();
    String getPrinterVersion();
    int updatePrinterState();

    void enterPrinterBuffer(boolean clean);
    void printerInit(ICallback callback);
    void setAlignment(int alignment, ICallback callback);
    void setFontSize(float fontsize, ICallback callback);
    void printText(String text, ICallback callback);
    void lineWrap(int n, ICallback callback);
    void exitPrinterBuffer(boolean commit);
    void openDrawer(ICallback callback);
}