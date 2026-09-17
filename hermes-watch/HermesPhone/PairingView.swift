import SwiftUI

struct PairingView: View {
    @EnvironmentObject private var model: PairingModel
    @FocusState private var codeFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                switch model.state {
                case let .paired(deviceId):
                    Section("Paired") {
                        Label("This iPhone is paired", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                        LabeledContent("Device", value: String(deviceId.suffix(8)))
                        LabeledContent("Relay", value: model.existing?.endpoint.host() ?? "—")
                        Button("Send to Apple Watch") { model.resendToWatch() }
                        Button("Unpair", role: .destructive) { model.unpair() }
                    }
                    Section {
                        Text("Your watch now talks to the relay directly over Wi‑Fi or cellular. This app isn't needed again unless you re-pair.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                default:
                    Section("Relay") {
                        TextField("hermes.example.com", text: $model.endpoint)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                    }
                    Section("Pairing code") {
                        TextField("XXXX-XXXX", text: $model.code)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .font(.system(.title3, design: .monospaced))
                            .focused($codeFocused)
                        Text("Sign in on the web and open /hermes to generate a code. It lasts 10 minutes and works once.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Section {
                        Button {
                            codeFocused = false
                            Task { await model.pair() }
                        } label: {
                            if model.state == .pairing {
                                ProgressView()
                            } else {
                                Text("Pair")
                            }
                        }
                        .disabled(model.state == .pairing)
                    }
                    if case let .failed(message) = model.state {
                        Section {
                            Label(message, systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                        }
                    }
                }

                Section("On your watch") {
                    stepRow(1, "Open Settings → Action Button")
                    stepRow(2, "Choose Shortcut")
                    stepRow(3, "Pick “Capture for Hermes”")
                    Text("Then one press of the Action button starts listening. Double Tap works too.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Hermes")
        }
    }

    private func stepRow(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(number)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 20, height: 20)
                .background(Circle().fill(Color.accentColor))
            Text(text)
        }
    }
}
