package com.koninja.scoreboard;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScoreboardPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
