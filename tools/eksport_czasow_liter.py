"""Dodaje do modelu Coqui VITS (Mai) wyjście z czasem trwania każdego znaku.

Węzeł /Ceil w grafie to zaokrąglone czasy znaków w ramkach (hop 256 próbek przy 22 050 Hz).
Wystawiamy go jako drugie wyjście: silnik ust zna wtedy dokładny moment każdej litery.

Użycie: python3 tools/eksport_czasow_liter.py model.onnx model-z-czasami.onnx
Potem: split -b 12000000 -d -a 1 model-z-czasami.onnx voice/mai-  (i dopisać .bin.wasm)
"""
import sys
import onnx
from onnx import helper, TensorProto

m = onnx.load(sys.argv[1])
m.graph.output.append(helper.make_tensor_value_info('/Ceil_output_0', TensorProto.FLOAT, None))
onnx.save(m, sys.argv[2])
print('zapisano', sys.argv[2])
