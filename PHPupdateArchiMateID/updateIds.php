<?php



    $sourceFile  = '';


    if ( isset($argv[1])) {
        $sourceFile     = $argv[1];  // source file
    }



    echo PHP_EOL . "Processing: " . $sourceFile . PHP_EOL;



    $class = new idReplacer ( $sourceFile );
    $class->run();

    /**
     *
     */
    class idReplacer

    {

        const NAME_SPACE            = 'a';
        const OBJECTID              = 'Object ID';


        const ARCHIMATE_ELEMENT         = 'element';
        const ARCHIMATE_ELEMENTS        = 'elements';
        const ARCHIMATE_RELATIONSHIP    = 'relationship';
        const ARCHIMATE_RELATIONSHIPS   = 'relationships';
        const ARCHIMATE_VIEW            = 'view';
        const ARCHIMATE_VIEWS           = 'views';
        const ARCHIMATE_DIAGRAMS        = 'diagrams';
        const ARCHIMATE_PROPERTIES      = 'properties';
        const ARCHIMATE_MODEL           = 'model';
        const ARCHIMATE_DOCUMENTATION   = 'documentation';
        const ARCHIMATE_PROPERTY        = 'property';
        const ARCHIMATE_IDENTIFIER      = 'identifier';
        const ARCHIMATE_NAME            = 'name';
        const ARCHIMATE_TYPE            = 'type';
        const ARCHIMATE_NODE            = 'node';
        const ARCHIMATE_CONNECTION      = 'connection';
        const ARCHIMATE_ELEMENTREF      = 'elementRef';
        const ARCHIMATE_STYLE           = 'style';
        const ARCHIMATE_FILLCOLOR       = 'fillColor';
        const ARCHIMATE_LINECOLOR       = 'lineColor';
        const ARCHIMATE_FONT            = 'font';
        const ARCHIMATE_STYLING         = 'styling';


        //ArchiMate 2 variables
        const ARCHIMATE2_PROPERTYDEFS   = 'propertydefs';
        const ARCHIMATE2_PROPERTYDEF    = 'propertydef';
        const ARCHIMATE2_INDENTIFIERREF = 'identifierref';
        const ARCHIMATE2_VIEWS          = 'views';

        //ArchiMate 3 variables
        const ARCHIMATE3_PROPERTYDEFS   = 'propertyDefinitions';
        const ARCHIMATE3_PROPERTYDEF    = 'propertyDefinition';
        const ARCHIMATE3_INDENTIFIERREF = 'propertyDefinitionRef';
        const ARCHIMATE3_VIEWS          = 'diagrams';


        public function __construct( $sourceFile ) {
            $this->sourceFile   = $sourceFile;
            $this->prefix       = '//' . self::NAME_SPACE . ':';

        }

        public function run () {

            // create source dom document and parser
            $this->createSources();

            // register namespaces for parser queries
            $this->registerNameSpaces();

            $this->setArchiMate3Variables();

            $this->listOfPropertydefsSource = $this->createPropertyDefArray();

            // do the job
            $this->replaceIds();

            $file = date("YmdHis") . '-' . $this->sourceFile ;
            file_put_contents($file, $this->sourceContent);



        }


        private function createSources() {
            $this->sourceContent = $this->readContent($this->sourceFile);
            $this->sourceDOMDoc = new DOMDocument();
            if ($this->sourceDOMDoc->loadXML($this->sourceContent)) {
                $this->sourceParser = new DOMXpath($this->sourceDOMDoc);
            } else {
                die ('Could not load XML string of ' .  $this->sourceFile );
            }
        }

        /**
         * read file content in string
         *
         * @param filename $file
         * @return string
         */
        private function readContent($file) {
            if (file_exists ( $file ) ){
                $content = file_get_contents($file);
                if (!$content) {
                    die ("Could not load input source file" . PHP_EOL) ;
                }
            } else {
                die ('Could not find source file'. PHP_EOL);
            }
            return $content;
        }

        /**
         * register name spaces
         */
        private function registerNameSpaces() {
            $this->rootNamespaceSource =  $this->sourceDOMDoc->lookupNamespaceUri($this->sourceDOMDoc->namespaceURI);
            $this->sourceParser->registerNamespace(self::NAME_SPACE, $this->rootNamespaceSource);
        }


        /**
         * sets the general ArchiMate 3 variables
         */
        private function setArchiMate3Variables() {
            $this->propertyDefs     = self::ARCHIMATE3_PROPERTYDEFS;
            $this->propertyDef      = self::ARCHIMATE3_PROPERTYDEF;
            $this->propertyDefRef   = self::ARCHIMATE3_INDENTIFIERREF;
            $this->tagDrawings      = self::ARCHIMATE3_VIEWS;
        }



        /**
         * This function is the main function for the merge of the two files.
         */
        private function replaceIds()
        {
            $this->collectDataForProcessing();
            $this->replaceIdForObjects( $this->sourceElements, 'Elements' );
            $this->replaceIdForObjects( $this->sourceRelationships, 'Relationships' );
            $this->replaceIdForObjects( $this->sourceViews, 'Views' );
        }


        private function replaceIdForObjects ($elements, $elementType) {


            echo PHP_EOL . 'Starting with ' . $elementType . PHP_EOL;
            $counter = 0;
            $counter2 = 0;
            foreach ($elements as $element) {
                $guid =  $this->getNodeValue($this->sourceParser, $element, self::OBJECTID);

                $id = $this->getAttribute($element, 'identifier');
                if ( 'id-' . $guid <> $id &&
                    !empty ( $guid)
                ) {
                    if ( strlen( $guid ) < 32 ) {
                        $oldGuid = $guid;
                        $guid = $this->createGUID($guid);
                        echo "New guid generated from $oldGuid --> ";
                    } //b5074647-34aa-4f9b-848b-c4d8a8b98dc5 = 8+1+4+4+4+12=33
                    echo "Id: $id is replaced by id-$guid" . PHP_EOL;
                    $this->sourceContent = str_replace($id, 'id-' . $guid, $this->sourceContent);
                    $counter++;
                } else { // NO OBJECT ID FOUND
                    if ( strlen( $id ) < 32) {
                        $oldId = $id;
                        $guid = $this->createGUID($id);
                        echo "New guid generated from $oldId --> ";
                        echo "Id: $oldId is replaced by id-$guid" . PHP_EOL;
                        $this->sourceContent = str_replace($id, 'id-' . $guid, $this->sourceContent);
                        $counter++;
                    } //(id-)b5074647-34aa-4f9b-848b-c4d8a8b98dc5 = 8+1+4+4+4+12=(36)33
                    else {
                        $counter2++;
                    }



                }
            }
            $total = $counter + $counter2;
            echo PHP_EOL . "$total $elementType have been processed." . PHP_EOL;
            echo "- $counter id's of $elementType have been replaced" . PHP_EOL;
            echo "- $counter2 id's of $elementType have NOT been replaced" . PHP_EOL;
        }

        /**
         * This function creates a stable guid on the basis of two other guids. Although this is not precisely a genuinely unique GUID
         * it is stable because the input guids are stable too.
         *
         * @param string $guid1
         * @param string $guid2
         *
         * @return string
         */
        private function createGUID( $guid1, $guid2 = null) {

            $charid = md5($guid1 . $guid2);
            $hyphen = chr(45);// "-"
            $guid = substr($charid, 0, 8) . $hyphen
                . substr($charid, 8, 4) . $hyphen
                . substr($charid,12, 4) . $hyphen
                . substr($charid,16, 4) . $hyphen
                . substr($charid,20,12);
            return strtolower($guid);

        }



        /**
         * create the data sets (dom node lists) for processing and get the general identifier for the attribute Object Id
         */
        private function collectDataForProcessing() {

            // process source
            $this->sourceElements         = $this->sourceParser->query($this->prefix . self::ARCHIMATE_ELEMENT);
            $this->sourceRelationships    = $this->sourceParser->query($this->prefix . self::ARCHIMATE_RELATIONSHIP);
            $this->sourceViews            = $this->sourceParser->query($this->prefix . self::ARCHIMATE_VIEW);
            $this->sourceModelProperties  = $this->sourceParser->query($this->prefix . self::ARCHIMATE_PROPERTIES);
            $this->sourceDiagrams         = $this->sourceParser->query($this->prefix . self::ARCHIMATE_DIAGRAMS)->item(0);


            // get the general property id for the 'Object ID' to be used to check every element/relationship and view
            $this->objectId = $this->findPropertyDefID(self::OBJECTID);


        }

        /**
         * this function creates an array with propertydefs to be used in this class
         * for searching for existing propertydefs
         */

        private function createPropertyDefArray () {

            $propDefs = $this->sourceParser->query($this->prefix . $this->propertyDef);
            $i = 0;
            $results = array();
            foreach ($propDefs as $propDef) {
                $prop  = $this->getAttribute($propDef, self::ARCHIMATE_IDENTIFIER);
                $value = trim($propDef->nodeValue) . PHP_EOL;
                $results[$prop] = $value;
                $i++;
            }

            return $results;
        }



        /**
         * This functions searches for a certain propertydef in the propertydefs array
         * if found it returns the propertydefID
         *
         * @param string $propName
         * @return string
         */
        private function findPropertyDefID ( $propname ) {

            $propertyID = '';
            foreach($this->listOfPropertydefsSource as $key => $value) {
                if ( trim($value) === $propname ) {
                    $propertyID = $key;
                }
            }

            return $propertyID;

        }

        /**
         * This function searches for the attribute of an object
         * and returns this value if found
         *
         * @param DOMNode $object
         * @param string $attribute
         * @return mixed
         */
        private function getAttribute ($object, $attribute) {
            $result = 'false';
            foreach ($object->attributes as $attr) {
                if ( $attr->nodeName == $attribute)  {
                    $result = $attr->nodeValue;
                    break;
                }
            }
            return $result;
        }


        /**
         * This function searches for a value of an attribute of a given node
         *
         * @param XPathObject $parser
         * @param DOMNode $object
         * @param string $propName
         * @return string
         */
        private function getNodeValue ($parser, $object, $propName) {
            $result = '';
            $properties = $parser->query('.' . $this->prefix . self::ARCHIMATE_PROPERTY, $object);
            foreach ( $properties as $property ) {
                $currentPropId =  $this->getAttribute($property, $this->propertyDefRef );
                if ( trim($currentPropId) == trim($this->objectId) )  {
                    $result = trim($property->nodeValue);
                    break;
                }
            }
            return $result;
        }


    }
die;



