package com.hzx.workbench;

import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 全面屏模式下内容会顶到状态栏下面（挡住页面标题）。
        // 给根容器加上状态栏/刘海高度的顶部内边距，把内容压回状态栏下方。
        View root = findViewById(android.R.id.content);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top = insets.getInsets(WindowInsets.Type.statusBars()
                    | WindowInsets.Type.displayCutout()).top;
            v.setPadding(0, top, 0, 0);
            return insets;
        });
    }
}
