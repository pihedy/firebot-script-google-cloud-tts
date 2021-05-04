import axios from "axios";
import { Firebot, ScriptModules } from "firebot-custom-scripts-types";
import { v4 as uuid } from "uuid";
import { getTTSAudioContent } from "./google-api";
import { logger } from "./logger";
import { wait } from "./utils";
import { EffectModel } from "./types";

export function buildGoogleTtsEffectType(
  frontendCommunicator: ScriptModules["frontendCommunicator"],
  fs: ScriptModules["fs"],
  path: ScriptModules["path"],
  googleCloudAPIKey: string
) {
  const googleTtsEffectType: Firebot.EffectType<EffectModel> = {
    definition: {
      id: "heyaapl:google-cloud-tts",
      name: "Google Cloud Text-to-Speech",
      description: "TTS via Google Cloud",
      icon: "fad fa-microphone-alt",
      categories: ["fun"],
      dependencies: [],
      triggers: {
        command: true,
        custom_script: true,
        startup_script: true,
        api: true,
        event: true,
        hotkey: true,
        timer: true,
        counter: true,
        preset: true,
        manual: true,
      },
    },
    optionsTemplate: `
      <eos-container header="Text">
          <textarea ng-model="effect.text" class="form-control" name="text" placeholder="Enter text" rows="4" cols="40" replace-variables menu-position="under"></textarea>
      </eos-container>

      <eos-container header="Volume" pad-top="true">
          <div class="volume-slider-wrapper">
              <i class="fal fa-volume-down volume-low"></i>
                <rzslider rz-slider-model="effect.volume" rz-slider-options="{floor: 1, ceil: 10, hideLimitLabels: true, showSelectionBar: true}"></rzslider>
              <i class="fal fa-volume-up volume-high"></i>
          </div>
      </eos-container>

      <eos-container header="Voice" pad-top="true">
        <ui-select ng-model="effect.voiceName" theme="bootstrap">
            <ui-select-match placeholder="Select or search for a voice...">{{$select.selected.name}}</ui-select-match>
            <ui-select-choices repeat="voice.name as voice in voices" style="position:relative;">
                <div ng-bind-html="voice.name | highlight: $select.search"></div>
                <small class="muted"><strong>{{voice.language}}</small>
            </ui-select-choices>
        </ui-select>
      </eos-container>
      <!--
      <eos-container header="Gender" pad-top="true">
            <dropdown-select options="{ MALE: 'Male', FEMALE: 'Female'}" selected="effect.voiceGender"></dropdown-select>
      </eos-container>
      -->
      <eos-container header="Pitch & Speed" pad-top="true">
        <div>Pitch</div>
        <rzslider rz-slider-model="effect.pitch" rz-slider-options="{floor: -20, ceil: 20, hideLimitLabels: true, showSelectionBar: true, step: 0.5, precision: 1}"></rzslider>
        <div>Speed</div>
        <rzslider rz-slider-model="effect.speakingRate" rz-slider-options="{floor: 0.25, ceil: 4, hideLimitLabels: true, showSelectionBar: true, step: 0.05, precision: 2}"></rzslider>
      </eos-container>

      <eos-audio-output-device effect="effect" pad-top="true"></eos-audio-output-device>
    `,
    optionsController: ($scope) => {
      if ($scope.effect.volume == null) {
        $scope.effect.volume = 10;
      }
      $scope.voices = [
        {name: "en-US-Wavenet-A", language: "English (US)"},
        {name: "en-US-Wavenet-B", language: "English (US)"},
        {name: "en-US-Wavenet-C", language: "English (US)"}
      ]as Array<{name:string;language:string}>;

      if ($scope.effect.voiceName == null){
        $scope.effect.voiceName = ($scope.voices as any)[0];
      }
      if ($scope.effect.voiceGender == null) {
        $scope.effect.voiceGender = "MALE";
      }
      if ($scope.effect.pitch == null) {
        $scope.effect.pitch = 0;
      }
      if ($scope.effect.speakingRate == null) {
        $scope.effect.speakingRate = 1;
      }
    },
    optionsValidator: (effect) => {
      const errors = [];
      if (effect.text == null || effect.text.length < 1) {
        errors.push("Please input some text.");
      }
      return errors;
    },
    onTriggerEvent: async (event) => {
      const effect = event.effect;

      try {
        //  synthesize text via google tts
        const audioContent = await getTTSAudioContent(effect, googleCloudAPIKey);

        if (audioContent == null) {
          // call to google tts api failed
          return true;
        }

        const filePath = path.join(process.cwd(), `tts${uuid()}.mp3`);

        // save audio content to file
        await fs.writeFile(filePath, Buffer.from(audioContent, "base64"));

        // get the duration of this tts sound duration
        const soundDuration = await frontendCommunicator.fireEventAsync<number>(
          "getSoundDuration",
          {
            path: filePath,
            format: "mp3",
          }
        );

        // play the TTS audio
        frontendCommunicator.send("playsound", {
          volume: effect.volume || 10,
          audioOutputDevice: effect.audioOutputDevice,
          format: "mp3",
          filepath: filePath,
        });

        // wait for the sound to finish (plus 1.5 sec buffer)
        await wait((soundDuration + 1.5) * 1000);

        // remove the audio file
        await fs.unlink(filePath);
      } catch (error) {
        logger.error("Google Cloud TTS Effect failed", error);
      }

      // returning true tells the firebot effect system this effect has completed
      // and that it can continue to the next effect
      return true;
    },
  };
  return googleTtsEffectType;
}