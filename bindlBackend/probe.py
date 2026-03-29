import sys, os, glob
print('python', sys.executable)
root = os.path.join(os.path.dirname(sys.executable), '..', 'Lib', 'site-packages')
root = os.path.normpath(root)
print('site-packages', root)
print('setuptools exists', os.path.isdir(os.path.join(root, 'setuptools')))
print('pkg_resources exists', os.path.isdir(os.path.join(root, 'pkg_resources')))
print('setuptools pkg_resources.py', os.path.exists(os.path.join(root, 'setuptools', 'pkg_resources.py')))
try:
    import pkg_resources
    print('pkg_resources import OK', pkg_resources.__file__)
except Exception as e:
    print('pkg_resources import failed', type(e), e)
